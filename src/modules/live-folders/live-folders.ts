import {
  Array,
  Clock,
  Context,
  Effect,
  FiberMap,
  Layer,
  Option,
  PubSub,
  Ref,
  Result,
  Stream,
} from "effect"
import type { BookmarkId, BrowserApiError } from "#platform/browser"
import { LiveFetcher } from "./live-fetcher"
import { LiveFolderCache } from "./live-folder-cache"
import { LiveSortStore } from "./live-sort-store"
import {
  markAllSeen,
  markItemSeen,
  recordFailed,
  recordFetched,
  type LiveFolderSnapshot,
} from "./live-folder-record"
import type { LiveItem, LiveSort, LiveSource } from "./live-source"

export class LiveFolders extends Context.Service<
  LiveFolders,
  {
    /**
     * 取得を始め、終わるのを待たずに戻る。同じフォルダの取得が進んでいる間は何もしない。
     *
     * 成功しても失敗しても、結果をキャッシュに残す。
     */
    refresh(folderId: BookmarkId, source: LiveSource): Effect.Effect<void>
    readonly snapshot: Effect.Effect<LiveFolderSnapshot>
    findItem(folderId: BookmarkId, itemId: string): Effect.Effect<Option.Option<LiveItem>>
    markItemSeen(folderId: BookmarkId, itemId: string): Effect.Effect<void, BrowserApiError>
    markAllSeen(folderId: BookmarkId): Effect.Effect<void, BrowserApiError>
    setSort(folderId: BookmarkId, sort: LiveSort): Effect.Effect<void, BrowserApiError>
    /** 進んでいる取得を止めてから、キャッシュと並べ方を捨てる。 */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** `folderIds` に含まれないフォルダのキャッシュと並べ方を捨てる。 */
    retainOnly(folderIds: ReadonlySet<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** 取得を始めたときと終えたときに、そのフォルダの ID が流れる。 */
    readonly refreshEvents: Stream.Stream<BookmarkId>
  }
>()("katip/live-folders/LiveFolders") {
  static readonly layerNoDeps = Layer.effect(
    LiveFolders,
    Effect.gen(function* () {
      const fetcher = yield* LiveFetcher
      const cache = yield* LiveFolderCache
      const sorts = yield* LiveSortStore
      const fibers = yield* FiberMap.make<BookmarkId>()
      const refreshing = yield* Ref.make<ReadonlySet<BookmarkId>>(new Set())
      const events = yield* PubSub.unbounded<BookmarkId>()
      const announce = (folderId: BookmarkId) => Effect.asVoid(PubSub.publish(events, folderId))

      const fetchAndRecord = Effect.fnUntraced(function* (
        folderId: BookmarkId,
        source: LiveSource,
      ) {
        const outcome = yield* Effect.result(fetcher.fetch(source))
        const now = yield* Clock.currentTimeMillis
        yield* cache.save(folderId, (previous) =>
          Result.match(outcome, {
            onSuccess: (items) => recordFetched(previous, items, now),
            onFailure: (error) => recordFailed(previous, error.failure, now),
          }),
        )
      })

      const finish = (folderId: BookmarkId) =>
        Effect.andThen(
          Ref.update(refreshing, (ids) => new Set([...ids].filter((id) => id !== folderId))),
          announce(folderId),
        )

      const refresh = Effect.fnUntraced(function* (folderId: BookmarkId, source: LiveSource) {
        const isStarting = yield* Ref.modify(refreshing, (ids) =>
          ids.has(folderId) ? [false, ids] : [true, new Set([...ids, folderId])],
        )
        if (!isStarting) return
        yield* announce(folderId)
        yield* FiberMap.run(
          fibers,
          folderId,
          fetchAndRecord(folderId, source).pipe(
            Effect.catch((error) =>
              Effect.logWarning("ライブフォルダの取得結果を保存できなかった", error),
            ),
            Effect.ensuring(finish(folderId)),
          ),
        )
      })

      return LiveFolders.of({
        refresh,
        snapshot: Effect.all({
          records: cache.all,
          refreshing: Ref.get(refreshing),
          sorts: sorts.all,
        }),
        findItem: (folderId, itemId) =>
          Effect.map(cache.get(folderId), (record) =>
            Option.flatMap(record, ({ items }) =>
              Array.findFirst(items, (item) => item.id === itemId),
            ),
          ),
        markItemSeen: (folderId, itemId) =>
          cache.modify(folderId, (record) => markItemSeen(record, itemId)),
        markAllSeen: (folderId) => cache.modify(folderId, markAllSeen),
        setSort: (folderId, sort) => sorts.set(folderId, sort),
        forget: Effect.fnUntraced(function* (folderIds) {
          yield* Effect.forEach(folderIds, (folderId) => FiberMap.remove(fibers, folderId), {
            discard: true,
          })
          yield* cache.forget(folderIds)
          yield* sorts.forget(folderIds)
        }),
        retainOnly: (folderIds) =>
          Effect.andThen(cache.retainOnly(folderIds), sorts.retainOnly(folderIds)),
        refreshEvents: Stream.fromPubSub(events),
      })
    }),
  )

  /** {@link LiveFetcher}、{@link LiveFolderCache}、{@link LiveSortStore} も合わせて提供する。 */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(LiveFetcher.layer),
    Layer.provideMerge(LiveFolderCache.layer),
    Layer.provideMerge(LiveSortStore.layer),
  )
}
