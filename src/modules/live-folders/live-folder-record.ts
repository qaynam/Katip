import { Array, Option, Record, Schema } from "effect"
import type { BookmarkId } from "#platform/browser"
import { LiveFetchFailure } from "./live-fetch-failure"
import { LiveItem, type LiveSort } from "./live-source"

export const LiveFolderAttempt = Schema.TaggedUnion({
  Fetched: { at: Schema.Number },
  Failed: { at: Schema.Number, failure: LiveFetchFailure },
})
export type LiveFolderAttempt = typeof LiveFolderAttempt.Type

/** One live folder's items from its last successful fetch, and the outcome of its last fetch. */
export const LiveFolderRecord = Schema.Struct({
  /** In the source's newest-first order. A failed fetch keeps the items from the previous one. */
  items: Schema.Array(LiveItem),
  lastAttempt: LiveFolderAttempt,
  /** For each item id, the item's update time when it was last seen. */
  seenVersions: Schema.Record(Schema.String, Schema.Number),
})
export type LiveFolderRecord = typeof LiveFolderRecord.Type

export interface LiveFolderSnapshot {
  /** Leaves out folders whose first fetch hasn't finished yet. */
  readonly records: ReadonlyMap<BookmarkId, LiveFolderRecord>
  readonly refreshing: ReadonlySet<BookmarkId>
  /** A folder missing from the map uses the default order (newest first). */
  readonly sorts: ReadonlyMap<BookmarkId, LiveSort>
}

/**
 * Whether an item is unread: never opened, or updated after it was opened.
 *
 * The Gmail feed only carries unread mail, so a mail stays unread until opened. A GitHub item
 * becomes unread again when a comment or review updates it after it was last seen.
 */
export const isUnseen = (record: LiveFolderRecord, item: LiveItem): boolean =>
  Option.match(Record.get(record.seenVersions, item.id), {
    onNone: () => true,
    onSome: (seenVersion) => item.updatedAt > seenVersion,
  })

/**
 * Replaces the items with the ones fetched.
 *
 * Drops what was seen of items gone from the source, so the record doesn't grow without bound.
 */
export const recordFetched = (
  previous: Option.Option<LiveFolderRecord>,
  items: ReadonlyArray<LiveItem>,
  at: number,
): LiveFolderRecord => {
  const currentIds = new Set(items.map((item) => item.id))
  const seenVersions = Option.match(previous, {
    onNone: () => ({}),
    onSome: (record) => Record.filter(record.seenVersions, (_, id) => currentIds.has(id)),
  })
  return { items, lastAttempt: { _tag: "Fetched", at }, seenVersions }
}

export const recordFailed = (
  previous: Option.Option<LiveFolderRecord>,
  failure: LiveFetchFailure,
  at: number,
): LiveFolderRecord => ({
  items: Option.match(previous, { onNone: () => [], onSome: (record) => record.items }),
  lastAttempt: { _tag: "Failed", at, failure },
  seenVersions: Option.match(previous, { onNone: () => ({}), onSome: (r) => r.seenVersions }),
})

/** Returns the record unchanged when it has no such item. */
export const markItemSeen = (record: LiveFolderRecord, itemId: string): LiveFolderRecord =>
  Option.match(
    Array.findFirst(record.items, (item) => item.id === itemId),
    {
      onNone: () => record,
      onSome: (item) => ({
        ...record,
        seenVersions: Record.set(record.seenVersions, item.id, item.updatedAt),
      }),
    },
  )

export const markAllSeen = (record: LiveFolderRecord): LiveFolderRecord => ({
  ...record,
  seenVersions: Record.fromEntries(record.items.map((item) => [item.id, item.updatedAt])),
})

/**
 * Whether it's time to refetch automatically. Always true when nothing was ever fetched.
 *
 * After a failure from hitting the rate limit, false until the given retry time whatever the
 * interval.
 */
export const isRefreshDue = (
  record: Option.Option<LiveFolderRecord>,
  now: number,
  minIntervalMs: number,
): boolean =>
  Option.match(record, {
    onNone: () => true,
    onSome: ({ lastAttempt }) => {
      const isBlocked =
        lastAttempt._tag === "Failed" &&
        lastAttempt.failure._tag === "RateLimited" &&
        now < lastAttempt.failure.retryAt
      return !isBlocked && now - lastAttempt.at >= minIntervalMs
    },
  })
