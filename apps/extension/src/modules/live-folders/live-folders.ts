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
import { LiveDisplayStore } from "./live-display-store"
import {
  markAllSeen,
  markItemSeen,
  newlyArrived,
  recordFailed,
  recordFetched,
  type LiveFolderSnapshot,
} from "./live-folder-record"
import type { LiveItem, LiveLimit, LiveSort, LiveSource } from "./live-source"

/** Items that turned up in a live folder since its previous fetch. */
export interface LiveArrival {
  readonly folderId: BookmarkId
  readonly source: LiveSource
  /** In the source's newest-first order. Never empty. */
  readonly items: ReadonlyArray<LiveItem>
}

export class LiveFolders extends Context.Service<
  LiveFolders,
  {
    /**
     * Starts a fetch and returns without waiting for it to finish. Does nothing while a fetch of
     * the same folder is in progress.
     *
     * The outcome, success or failure, is kept in the cache.
     */
    refresh(folderId: BookmarkId, source: LiveSource): Effect.Effect<void>
    readonly snapshot: Effect.Effect<LiveFolderSnapshot>
    findItem(folderId: BookmarkId, itemId: string): Effect.Effect<Option.Option<LiveItem>>
    markItemSeen(folderId: BookmarkId, itemId: string): Effect.Effect<void, BrowserApiError>
    markAllSeen(folderId: BookmarkId): Effect.Effect<void, BrowserApiError>
    setSort(folderId: BookmarkId, sort: LiveSort): Effect.Effect<void, BrowserApiError>
    setLimit(folderId: BookmarkId, limit: LiveLimit): Effect.Effect<void, BrowserApiError>
    /** Stops any fetch in progress, then discards the cache, the sort order and the limit. */
    forget(folderIds: ReadonlyArray<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** Discards the cache, the sort order and the limit of every folder not in `folderIds`. */
    retainOnly(folderIds: ReadonlySet<BookmarkId>): Effect.Effect<void, BrowserApiError>
    /** Emits a folder's id when a fetch of it starts and when it finishes. */
    readonly refreshEvents: Stream.Stream<BookmarkId>
    /**
     * Emits the items a successful fetch found that the folder's previous fetch didn't have, once
     * the outcome is saved. Emits nothing for a folder's first successful fetch.
     */
    readonly arrivals: Stream.Stream<LiveArrival>
  }
>()("katip/live-folders/LiveFolders") {
  static readonly layerNoDeps = Layer.effect(
    LiveFolders,
    Effect.gen(function* () {
      const fetcher = yield* LiveFetcher
      const cache = yield* LiveFolderCache
      const display = yield* LiveDisplayStore
      const fibers = yield* FiberMap.make<BookmarkId>()
      const refreshing = yield* Ref.make<ReadonlySet<BookmarkId>>(new Set())
      const events = yield* PubSub.unbounded<BookmarkId>()
      const announce = (folderId: BookmarkId) => Effect.asVoid(PubSub.publish(events, folderId))
      const arrivals = yield* PubSub.unbounded<LiveArrival>()

      const fetchAndRecord = Effect.fnUntraced(function* (
        folderId: BookmarkId,
        source: LiveSource,
      ) {
        const outcome = yield* Effect.result(fetcher.fetch(source))
        const now = yield* Clock.currentTimeMillis
        const previous = yield* cache.get(folderId)
        yield* cache.save(folderId, (latest) =>
          Result.match(outcome, {
            onSuccess: (items) => recordFetched(latest, items, now),
            onFailure: (error) => recordFailed(latest, error.failure, now),
          }),
        )
        if (Result.isFailure(outcome)) return
        const arrived = newlyArrived(previous, outcome.success)
        if (arrived.length > 0)
          yield* PubSub.publish(arrivals, { folderId, source, items: arrived })
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
              Effect.logWarning("Couldn't save the live folder's fetch outcome", error),
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
          sorts: display.sorts,
          limits: display.limits,
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
        setSort: display.setSort,
        setLimit: display.setLimit,
        forget: Effect.fnUntraced(function* (folderIds) {
          yield* Effect.forEach(folderIds, (folderId) => FiberMap.remove(fibers, folderId), {
            discard: true,
          })
          yield* cache.forget(folderIds)
          yield* display.forget(folderIds)
        }),
        retainOnly: (folderIds) =>
          Effect.andThen(cache.retainOnly(folderIds), display.retainOnly(folderIds)),
        refreshEvents: Stream.fromPubSub(events),
        arrivals: Stream.fromPubSub(arrivals),
      })
    }),
  )

  /** Also provides {@link LiveFetcher}, {@link LiveFolderCache} and {@link LiveDisplayStore}. */
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(LiveFetcher.layer),
    Layer.provideMerge(LiveFolderCache.layer),
    Layer.provideMerge(LiveDisplayStore.layer),
  )
}
