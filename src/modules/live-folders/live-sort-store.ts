import { Context, Effect, Layer, Record, Schema } from "effect"
import { BookmarkId, Storage, type BrowserApiError } from "#platform/browser"
import { makePersistedRef } from "#platform/persisted-ref"
import { LiveSort } from "./live-source"

const LiveSorts = Schema.Record(BookmarkId, LiveSort)
type LiveSorts = typeof LiveSorts.Type

export const DEFAULT_LIVE_SORT: LiveSort = "newest"

/** ライブフォルダごとの並べ方。既定の並べ方のフォルダは保存しない。 */
export class LiveSortStore extends Context.Service<
  LiveSortStore,
  {
    /** 含まれないフォルダは既定の並べ方（新しい順）。 */
    readonly all: Effect.Effect<ReadonlyMap<BookmarkId, LiveSort>>
    set(folderId: BookmarkId, sort: LiveSort): Effect.Effect<void, BrowserApiError>
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** `folderIds` に含まれないフォルダの並べ方を捨てる。 */
    retainOnly(folderIds: ReadonlySet<BookmarkId>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/live-folders/LiveSortStore") {
  static readonly layer = Layer.effect(
    LiveSortStore,
    Effect.gen(function* () {
      const storage = yield* Storage
      const sorts = yield* makePersistedRef({
        area: storage.local,
        key: "katip/live-folders/sorts",
        schema: LiveSorts,
        initial: (): LiveSorts => ({}),
      })

      const removeWhere = (shouldRemove: (folderId: BookmarkId) => boolean) =>
        Effect.flatMap(sorts.get, (all) =>
          Record.keys(all).some(shouldRemove)
            ? Effect.asVoid(
                sorts.update((current) => Record.filter(current, (_, id) => !shouldRemove(id))),
              )
            : Effect.void,
        )

      return LiveSortStore.of({
        all: Effect.map(sorts.get, (all) => new Map(Record.toEntries(all))),
        set: (folderId, sort) =>
          Effect.asVoid(
            sorts.update((all) =>
              sort === DEFAULT_LIVE_SORT
                ? Record.remove(all, folderId)
                : Record.set(all, folderId, sort),
            ),
          ),
        forget: (folderIds) => removeWhere((id) => folderIds.includes(id)),
        retainOnly: (folderIds) => removeWhere((id) => !folderIds.has(id)),
      })
    }),
  )
}
