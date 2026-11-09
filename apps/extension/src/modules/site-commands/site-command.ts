import { Option, Schema } from "effect"

export const SiteCommandId = Schema.String.pipe(Schema.brand("SiteCommandId"))
export type SiteCommandId = typeof SiteCommandId.Type

const PLACEHOLDER = "%s"

// Only pages, like the URLs Spotlight opens: a javascript: URL would run a script on the page in
// front whenever the command is used
const isWebPage = (template: string) => {
  // A placeholder can stand in for a label of the host name, which an empty string would leave
  // invalid
  const sample = template.replaceAll(PLACEHOLDER, "x")
  if (!URL.canParse(sample)) return false
  const { protocol } = new URL(sample)
  return protocol === "https:" || protocol === "http:"
}

/** The page a command opens, with `%s` where what is typed after its keyword goes. */
export const CommandUrl = Schema.String.pipe(
  Schema.check(Schema.makeFilter(isWebPage, { expected: "an http or https URL" })),
  Schema.brand("CommandUrl"),
)
export type CommandUrl = typeof CommandUrl.Type

/** What is typed after `!` to use a command in Spotlight: lowercase, without spaces or `!`. */
export const CommandKeyword = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[^\s!\p{Lu}]{1,32}$/u)),
  Schema.brand("CommandKeyword"),
)
export type CommandKeyword = typeof CommandKeyword.Type

export const CommandTitle = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\S(.{0,98}\S)?$/u)),
  Schema.brand("CommandTitle"),
)
export type CommandTitle = typeof CommandTitle.Type

/** A command added in the settings that opens a page, or searches a site for what is typed. */
export const SiteCommand = Schema.Struct({
  id: SiteCommandId,
  title: CommandTitle,
  url: CommandUrl,
  keyword: Schema.NullOr(CommandKeyword),
})
export type SiteCommand = typeof SiteCommand.Type

/** Whether the command searches for what is typed after its keyword. */
export const searchesWithQuery = (url: CommandUrl): boolean => url.includes(PLACEHOLDER)

/** A command as typed into the settings form, before it is checked. */
export interface SiteCommandDraft {
  readonly title: string
  readonly url: string
  readonly keyword: string
}

export type DraftProblem =
  | "TitleMissing"
  | "UrlInvalid"
  | "KeywordInvalid"
  /** A command that searches can only be used through its keyword. */
  | "KeywordMissing"
  | "KeywordTaken"

export type DraftCheck =
  | {
      readonly _tag: "Valid"
      readonly fields: Omit<SiteCommand, "id">
    }
  | { readonly _tag: "Invalid"; readonly problems: ReadonlyArray<DraftProblem> }

const decodeTitle = Schema.decodeUnknownOption(CommandTitle)
const decodeUrl = Schema.decodeUnknownOption(CommandUrl)
const decodeKeyword = Schema.decodeUnknownOption(CommandKeyword)

// Typed as people type addresses into the address bar, often without the scheme
const withScheme = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`)

const keywordOf = (typed: string) => typed.trim().replace(/^!/, "").toLowerCase()

/**
 * Checks a command typed into the settings and tidies it up: the spaces around each field go, a URL
 * without a scheme gets https://, and the keyword loses a leading `!` and becomes lowercase.
 *
 * @param takenKeywords - The keywords of the other commands, which this one can't share.
 */
export const checkDraft = (
  draft: SiteCommandDraft,
  takenKeywords: ReadonlySet<string>,
): DraftCheck => {
  const title = decodeTitle(draft.title.trim())
  const url = draft.url.trim() === "" ? Option.none() : decodeUrl(withScheme(draft.url.trim()))
  const typedKeyword = keywordOf(draft.keyword)
  const keyword = typedKeyword === "" ? Option.none() : decodeKeyword(typedKeyword)
  const problems: ReadonlyArray<DraftProblem> = [
    ...(Option.isNone(title) ? ["TitleMissing" as const] : []),
    ...(Option.isNone(url) ? ["UrlInvalid" as const] : []),
    ...(typedKeyword !== "" && Option.isNone(keyword) ? ["KeywordInvalid" as const] : []),
    ...(typedKeyword === "" && Option.exists(url, searchesWithQuery)
      ? ["KeywordMissing" as const]
      : []),
    ...(takenKeywords.has(typedKeyword) ? ["KeywordTaken" as const] : []),
  ]
  if (problems.length > 0 || Option.isNone(title) || Option.isNone(url)) {
    return { _tag: "Invalid", problems }
  }
  return {
    _tag: "Valid",
    fields: { title: title.value, url: url.value, keyword: Option.getOrNull(keyword) },
  }
}
