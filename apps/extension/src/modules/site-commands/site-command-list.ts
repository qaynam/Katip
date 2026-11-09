import { Array, Option, Schema } from "effect"
import { type Bang, DEFAULT_BANG_FORMAT } from "#modules/bangs"
import type { Translator } from "#modules/i18n"
import {
  DEFAULT_SITE_COMMANDS,
  DefaultSiteCommandId,
  type DefaultSiteCommandId as DefaultId,
} from "./default-site-commands"
import {
  type CommandKeyword,
  type CommandUrl,
  SiteCommand,
  type SiteCommandId,
} from "./site-command"

export const SiteCommandList = Schema.Struct({
  /** The commands added in the settings, in the order added. */
  added: Schema.Array(SiteCommand),
  /** Which of the commands Katip comes with were removed. */
  removedDefaults: Schema.Array(DefaultSiteCommandId),
})
export type SiteCommandList = typeof SiteCommandList.Type

export const emptySiteCommandList: SiteCommandList = { added: [], removedDefaults: [] }

const StoredSiteCommandList = Schema.Struct({
  added: Schema.Array(Schema.Unknown),
  removedDefaults: Schema.Array(Schema.Unknown),
})

const decodeCommand = Schema.decodeUnknownOption(SiteCommand)
const decodeDefaultId = Schema.decodeUnknownOption(DefaultSiteCommandId)
const decodeStoredList = Schema.decodeUnknownOption(StoredSiteCommandList)

/**
 * The saved commands, read one at a time so that a broken one doesn't take the rest with it.
 * Nothing saved, or nothing readable, is the list Katip starts with.
 */
export const siteCommandListOfStored = (stored: unknown): SiteCommandList =>
  Option.match(decodeStoredList(stored), {
    onNone: () => emptySiteCommandList,
    onSome: (list) => ({
      added: Array.getSomes(list.added.map((command) => decodeCommand(command))),
      removedDefaults: Array.getSomes(list.removedDefaults.map((id) => decodeDefaultId(id))),
    }),
  })

/** Which command a listed command is, to edit or remove it. */
export type SiteCommandRef =
  | { readonly _tag: "Default"; readonly id: DefaultId }
  | { readonly _tag: "Added"; readonly id: SiteCommandId }

export interface ListedSiteCommand {
  readonly ref: SiteCommandRef
  /** In the display language. */
  readonly title: string
  readonly url: CommandUrl
  readonly keyword: CommandKeyword | null
  /** A page of the site the command opens, for its favicon. */
  readonly iconPageUrl: string
}

// The query can stand in for a label of the host name, as in https://%s.example.com/
const siteUrlOf = (url: CommandUrl) =>
  `${new URL(url.replaceAll("%s.", "").replaceAll("%s", "")).origin}/`

/** A key that tells listed commands apart, for keyed lists. */
export const keyOfRef = (ref: SiteCommandRef): string => `${ref._tag}:${ref.id}`

/**
 * The commands to offer: those Katip comes with that weren't removed, followed by the added ones.
 *
 * @param translator - The language of the titles of the commands Katip comes with.
 */
export const listedSiteCommands = (
  list: SiteCommandList,
  translator: Translator,
): ReadonlyArray<ListedSiteCommand> => [
  ...DEFAULT_SITE_COMMANDS.filter((command) => !list.removedDefaults.includes(command.id)).map(
    (command): ListedSiteCommand => ({
      ref: { _tag: "Default", id: command.id },
      title: translator.t(command.title),
      url: command.url,
      keyword: null,
      iconPageUrl: command.iconPageUrl,
    }),
  ),
  ...list.added.map((command): ListedSiteCommand => ({
    ref: { _tag: "Added", id: command.id },
    title: command.title,
    url: command.url,
    keyword: command.keyword,
    iconPageUrl: siteUrlOf(command.url),
  })),
]

export const withCommandAdded = (list: SiteCommandList, command: SiteCommand): SiteCommandList => ({
  ...list,
  added: [...list.added, command],
})

/**
 * Replaces a command with `command`. An added command keeps its place; one Katip comes with is
 * removed, and `command` is added after the others in its place.
 */
export const withCommandEdited = (
  list: SiteCommandList,
  ref: SiteCommandRef,
  command: SiteCommand,
): SiteCommandList =>
  ref._tag === "Added"
    ? { ...list, added: list.added.map((added) => (added.id === ref.id ? command : added)) }
    : withCommandAdded(withCommandRemoved(list, ref), command)

export const withCommandRemoved = (list: SiteCommandList, ref: SiteCommandRef): SiteCommandList =>
  ref._tag === "Added"
    ? { ...list, added: list.added.filter((added) => added.id !== ref.id) }
    : {
        ...list,
        removedDefaults: list.removedDefaults.includes(ref.id)
          ? list.removedDefaults
          : [...list.removedDefaults, ref.id],
      }

/** Brings back the commands Katip comes with that were removed. */
export const withDefaultsRestored = (list: SiteCommandList): SiteCommandList => ({
  ...list,
  removedDefaults: [],
})

/** The keywords of the listed commands, leaving out the one `except` refers to. */
export const keywordsExcept = (
  commands: ReadonlyArray<ListedSiteCommand>,
  except: Option.Option<SiteCommandRef>,
): ReadonlySet<string> =>
  new Set(
    commands.flatMap((command) =>
      command.keyword === null ||
      Option.exists(except, (ref) => keyOfRef(ref) === keyOfRef(command.ref))
        ? []
        : [command.keyword],
    ),
  )

/** The commands with a keyword, as bangs that the keyword triggers. */
export const bangsOfSiteCommands = (
  commands: ReadonlyArray<ListedSiteCommand>,
): ReadonlyArray<Bang> =>
  commands.flatMap((command) =>
    command.keyword === null
      ? []
      : [
          {
            name: command.title,
            triggers: [command.keyword],
            template: command.url,
            format: DEFAULT_BANG_FORMAT,
          },
        ],
  )
