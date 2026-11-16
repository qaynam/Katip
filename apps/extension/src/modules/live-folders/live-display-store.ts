import { Context, Effect, Layer, Record, Schema } from "effect"
import { BookmarkId, Storage, type BrowserApiError, type StorageArea } from "#platform/browser"
import { makePersistedRef } from "#platform/persisted-ref"
import { LiveLimit, LiveSort } from "./live-source"

export const DEFAULT_LIVE_SORT: LiveSort = "newest"

// Not all: a folder of fifty review requests would push the pins and tabs below it out of sight
export const DEFAULT_LIVE_LIMIT: LiveLimit = 10

const makeFolderChoices = Effect.fnUntraced(function* <A extends LiveSort | LiveLimit>(options: {
  readonly area: StorageArea
  readonly key: string
  readonly choice: Schema.Codec<A>
  /** Not stored: a folder missing from the map has it. */
  readonly defaultChoice: A
}) {
  const choices = yield* makePersistedRef({
    area: options.area,
    key: options.key,
    schema: Schema.Record(BookmarkId, options.choice),
    initial: (): Record.ReadonlyRecord<BookmarkId, A> => ({}),
  })
  return {
    all: Effect.map(
      choices.get,
      (all): ReadonlyMap<BookmarkId, A> => new Map(Record.toEntries(all)),
    ),
    set: (folderId: BookmarkId, choice: A) =>
      Effect.asVoid(
        choices.update((all) =>
          choice === options.defaultChoice
            ? Record.remove(all, folderId)
            : Record.set(all, folderId, choice),
        ),
      ),
    removeWhere: (shouldRemove: (folderId: BookmarkId) => boolean) =>
      Effect.flatMap(choices.get, (all) =>
        Record.keys(all).some(shouldRemove)
          ? Effect.asVoid(
              choices.update((current) => Record.filter(current, (_, id) => !shouldRemove(id))),
            )
          : Effect.void,
      ),
  }
})

/**
 * How each live folder shows its items, as chosen from its menu: in what order, and how many.
 * Folders left at the defaults aren't stored.
 */
export class LiveDisplayStore extends Context.Service<
  LiveDisplayStore,
  {
    /** A folder missing from the map uses the default order (newest first). */
    readonly sorts: Effect.Effect<ReadonlyMap<BookmarkId, LiveSort>>
    /** A folder missing from the map shows the default number of items. */
    readonly limits: Effect.Effect<ReadonlyMap<BookmarkId, LiveLimit>>
    setSort(folderId: BookmarkId, sort: LiveSort): Effect.Effect<void, BrowserApiError>
    setLimit(folderId: BookmarkId, limit: LiveLimit): Effect.Effect<void, BrowserApiError>
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** Discards the order and the limit of every folder not in `folderIds`. */
    retainOnly(folderIds: ReadonlySet<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/live-folders/LiveDisplayStore") {
  static readonly layer = Layer.effect(
    LiveDisplayStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      // Not one map holding both choices of a folder: the sorts stay readable under the key, and
      // in the shape, that earlier versions of Katip stored them in
      const sorts = yield* makeFolderChoices({
        area: storage.local,
        key: "katip/live-folders/sorts",
        choice: LiveSort,
        defaultChoice: DEFAULT_LIVE_SORT,
      })
      const limits = yield* makeFolderChoices({
        area: storage.local,
        key: "katip/live-folders/limits",
        choice: LiveLimit,
        defaultChoice: DEFAULT_LIVE_LIMIT,
      })

      const removeWhere = (shouldRemove: (folderId: BookmarkId) => boolean) =>
        Effect.andThen(sorts.removeWhere(shouldRemove), limits.removeWhere(shouldRemove))

      return LiveDisplayStore.of({
        sorts: sorts.all,
        limits: limits.all,
        setSort: sorts.set,
        setLimit: limits.set,
        forget: (folderIds) => removeWhere((id) => folderIds.includes(id)),
        retainOnly: (folderIds) => removeWhere((id) => !folderIds.has(id)),
      })
    }),
  )
}
