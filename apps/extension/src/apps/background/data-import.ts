import { Array, type Cause, Effect, Match, Option, Schema, Stream } from "effect"
import { decodeExportFile, type LatestExport } from "#modules/export"
import { updateFavoritesOf } from "#modules/favorites"
import { planImport, planSpace, type PlannedNode, type PlannedSpace } from "#modules/import"
import { DEFAULT_LIVE_LIMIT, DEFAULT_LIVE_SORT, LiveFolders } from "#modules/live-folders"
import {
  FolderIconStore,
  PinnedBookmarks,
  PinnedParent,
  SpaceFolders,
  type FolderDepthExceeded,
  type FolderNestingRule,
  type PinnedNodeNotFound,
} from "#modules/pinned"
import type { SettingsRepository } from "#modules/settings"
import { addSpace, nextSpaceName, SpaceName, unusedSpaceName, type Space } from "#modules/space"
import { settleTheme } from "#modules/theme"
import { type BrowserApiError, type BrowserPort } from "#platform/browser"
import { ImportClientMessage, ImportServerMessage } from "#protocol"
import { newSpaceId } from "./initialize"
import { newFavoriteId } from "./favorites"
import { KatipState } from "./katip-state"
import { refreshDueLiveFolders, scheduleLiveFolderRefresh } from "./live-folder-refresh"
import { currentNestingRule } from "./sidebar-commands"
import { numberedSpaceName, translate } from "./translation"

/** The content isn't an export file this Katip can read. */
class UnreadableImport extends Schema.TaggedError<UnreadableImport>()("UnreadableImport", {}) {}

/** Runs an effect in turn with the other changes to Katip's state, within their time limit. */
export type Serialize = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E | Cause.TimeoutError, R>

type FileSpace = LatestExport["spaces"][number]

const readDocument = (content: string) =>
  Effect.mapError(Effect.fromResult(decodeExportFile(content)), () => new UnreadableImport())

/** What importing the content would add and leave out. Changes nothing. */
export const previewImport = Effect.fnUntraced(function* (content: string) {
  const document = yield* readDocument(content)
  return planImport(document, { rule: yield* currentNestingRule }).summary
})

const decodeSpaceName = Schema.decodeUnknownOption(SpaceName)

interface SpaceAdding {
  /** Whether Katip picks the theme, as for a new Space, instead of taking the file's. */
  readonly picksTheme: boolean
  /** Whether the name is the import's suggestion, to number when a Space already has it. */
  readonly isNamedByImport: boolean
  /** Whether the Space gets its Favorites from the file. */
  readonly addsFavorites: boolean
}

// Added closed: opening every Favorite of a file at once would flood the window with tabs
const addPlannedFavorites = Effect.fnUntraced(function* (planned: PlannedSpace, space: Space) {
  const added = yield* Effect.forEach(planned.favorites, ({ title, url }) =>
    Effect.map(newFavoriteId, (id) => ({ id, title, url })),
  )
  yield* KatipState.use((state) =>
    state.spaceFavorites.update((favorites) =>
      updateFavoritesOf(favorites, space.id, (list) => [...list, ...added]),
    ),
  )
})

const addPlannedSpace = Effect.fnUntraced(function* (planned: PlannedSpace, adding: SpaceAdding) {
  const id = yield* newSpaceId
  const numbered = yield* numberedSpaceName
  const spaces = yield* (yield* KatipState).spaces.update((current) =>
    addSpace(current, {
      id,
      name: Option.match(decodeSpaceName(planned.name), {
        onNone: () => nextSpaceName(current, numbered),
        onSome: (name) => (adding.isNamedByImport ? unusedSpaceName(current, name) : name),
      }),
      ...(!adding.picksTheme && { theme: settleTheme(planned.theme) }),
    }),
  )
  const space = yield* Effect.fromOption(Array.findFirst(spaces, (added) => added.id === id))
  yield* (yield* SpaceFolders).ensureSpaceFolder(space)
  if (adding.addsFavorites) yield* addPlannedFavorites(planned, space)
  return space
})

type CreationError = PinnedNodeNotFound | FolderDepthExceeded | BrowserApiError
type CreationServices = PinnedBookmarks | FolderIconStore | LiveFolders | SettingsRepository

const createNode = (
  node: PlannedNode,
  parent: PinnedParent,
  rule: FolderNestingRule,
): Effect.Effect<void, CreationError, CreationServices> =>
  Effect.gen(function* () {
    const pinned = yield* PinnedBookmarks
    yield* Match.valueTags(node, {
      Pin: ({ title, url }) => Effect.asVoid(pinned.createBookmark({ parent }, { title, url })),
      Split: ({ left, right }) =>
        Effect.asVoid(
          pinned.createSplit({ parent }, { title: `${left.title} | ${right.title}`, left, right }),
        ),
      LiveFolder: ({ title, source, sort, limit }) =>
        Effect.gen(function* () {
          const folderId = yield* pinned.createLiveFolder({ parent }, { title, source })
          const liveFolders = yield* LiveFolders
          if (sort !== DEFAULT_LIVE_SORT) yield* liveFolders.setSort(folderId, sort)
          if (limit !== DEFAULT_LIVE_LIMIT) yield* liveFolders.setLimit(folderId, limit)
        }),
      Folder: ({ title, icon, children }) =>
        Effect.gen(function* () {
          const named = title.trim() === "" ? yield* translate("common.newFolder") : title
          const folderId = yield* pinned.createFolder({ parent }, { title: named }, rule)
          if (icon !== null) yield* (yield* FolderIconStore).setIcon(folderId, icon)
          yield* Effect.forEach(
            children,
            (child) => createNode(child, PinnedParent.Folder({ folderId }), rule),
            { discard: true },
          )
        }),
    })
  })

// Not one step for the whole Space: a Space with hundreds of pins could outlast the time limit for
// a change and be cut off partway, and other changes would wait the whole time. Each entry at the
// Space's top level is a step of its own instead
const addFileSpace = Effect.fnUntraced(function* (
  space: FileSpace,
  sharedFavorites: LatestExport["favorites"],
  adding: SpaceAdding,
  serialize: Serialize,
) {
  const { planned, created, rule } = yield* serialize(
    Effect.gen(function* () {
      const rule = yield* currentNestingRule
      const planned = planSpace(space, rule, sharedFavorites)
      return { planned, created: yield* addPlannedSpace(planned, adding), rule }
    }),
  )
  const root = PinnedParent.SpaceRoot({ space: created })
  yield* Effect.forEach(planned.pinned, (node) => serialize(createNode(node, root, rule)), {
    discard: true,
  })
  return planned
})

const hasLiveFolder = (nodes: ReadonlyArray<PlannedNode>): boolean =>
  nodes.some(
    (node) =>
      node._tag === "LiveFolder" || (node._tag === "Folder" && hasLiveFolder(node.children)),
  )

/**
 * Adds the content's Spaces, each with its Favorites when asked.
 *
 * @remarks
 * Only adds: each Space in the content becomes a new Space after the existing ones, and no
 * existing Space, pin or setting changes. A name the import suggested gets a number when a Space
 * already has it; a name from the file is kept as it is. Favorites are added closed. A file from
 * the time every Space shared the Favorites gives them to each of its Spaces. Temporary tabs and
 * settings in the content aren't imported. When a step fails, the Spaces added before it are kept.
 */
export const applyImport = Effect.fnUntraced(function* (
  request: Extract<ImportClientMessage, { readonly _tag: "Apply" }>,
  serialize: Serialize,
) {
  const document = yield* readDocument(request.content)
  const withoutTheme = new Set(request.spacesWithoutTheme)
  const namedByImport = new Set(request.spacesNamedByImport)
  const added = yield* Effect.forEach(document.spaces, (space) =>
    addFileSpace(
      space,
      document.favorites,
      {
        picksTheme: withoutTheme.has(space.id),
        isNamedByImport: namedByImport.has(space.id),
        addsFavorites: request.addFavorites,
      },
      serialize,
    ),
  )
  if (added.some((space) => hasLiveFolder(space.pinned))) {
    yield* serialize(Effect.andThen(scheduleLiveFolderRefresh, refreshDueLiveFolders))
  }
})

const decodeClientMessage = Schema.decodeUnknownEffect(ImportClientMessage)
const encodeServerMessage = Schema.encodeEffect(ImportServerMessage)

// Sending fails only once the settings page is closed, so an answer that can't be sent is dropped
const reply = (port: BrowserPort, message: ImportServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.ignore,
  )

const answer = (
  message: ImportClientMessage,
  serialize: Serialize,
  afterChange: Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    if (message._tag === "Preview") {
      const summary = yield* serialize(previewImport(message.content))
      return { _tag: "Previewed", summary } satisfies ImportServerMessage
    }
    yield* applyImport(message, (effect) => Effect.tap(serialize(effect), () => afterChange))
    return { _tag: "Applied" } satisfies ImportServerMessage
  }).pipe(
    Effect.catchTag("UnreadableImport", () =>
      Effect.succeed({ _tag: "Unreadable" } satisfies ImportServerMessage),
    ),
    // A defect gets an answer too. Without one, the settings page could only report the failure
    // once its wait ran out
    Effect.catchCause((cause) =>
      Effect.as(Effect.logError("Couldn't import", cause), {
        _tag: "Failed",
      } satisfies ImportServerMessage),
    ),
  )

/**
 * Answers the settings page's import requests until it disconnects.
 *
 * @param serialize - Runs each step that reads or changes Katip's state.
 * @param afterChange - Runs after each step that changes Katip's state.
 */
export const serveDataImport = (
  port: BrowserPort,
  serialize: Serialize,
  afterChange: Effect.Effect<void>,
) =>
  port.messages.pipe(
    Stream.runForEach((raw) =>
      Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
        Option.isNone(message)
          ? Effect.void
          : Effect.flatMap(answer(message.value, serialize, afterChange), (answered) =>
              reply(port, answered),
            ),
      ),
    ),
  )
