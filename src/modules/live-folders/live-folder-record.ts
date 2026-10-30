import { Array, Option, Record, Schema } from "effect"
import type { BookmarkId } from "#platform/browser"
import { LiveFetchFailure } from "./live-fetch-failure"
import { LiveItem, type LiveSort } from "./live-source"

export const LiveFolderAttempt = Schema.TaggedUnion({
  Fetched: { at: Schema.Number },
  Failed: { at: Schema.Number, failure: LiveFetchFailure },
})
export type LiveFolderAttempt = typeof LiveFolderAttempt.Type

/** ライブフォルダ 1 つ分の、最後に取得できた項目と最後の取得の結果。 */
export const LiveFolderRecord = Schema.Struct({
  /** 取得元が新しい順に並べた順。取得に失敗しても、前回取得できた項目を残す。 */
  items: Schema.Array(LiveItem),
  lastAttempt: LiveFolderAttempt,
  /** 項目の ID ごとに、最後に見たときのその項目の更新時刻。 */
  seenVersions: Schema.Record(Schema.String, Schema.Number),
})
export type LiveFolderRecord = typeof LiveFolderRecord.Type

export interface LiveFolderSnapshot {
  /** まだ一度も取得を終えていないフォルダは含まない。 */
  readonly records: ReadonlyMap<BookmarkId, LiveFolderRecord>
  readonly refreshing: ReadonlySet<BookmarkId>
  /** 含まれないフォルダは既定の並べ方（新しい順）。 */
  readonly sorts: ReadonlyMap<BookmarkId, LiveSort>
}

/**
 * 項目を開いた後に更新されたか、一度も開いていなければ未読。
 *
 * Gmail のフィードには未読のメールしか載らないので、開くまでは未読のまま。
 * GitHub は、前回見た時刻より後にコメントやレビューで更新されると未読に戻る。
 */
export const isUnseen = (record: LiveFolderRecord, item: LiveItem): boolean =>
  Option.match(Record.get(record.seenVersions, item.id), {
    onNone: () => true,
    onSome: (seenVersion) => item.updatedAt > seenVersion,
  })

/**
 * 取得できた項目で置き換える。
 *
 * 取得元から消えた項目の既読の記録は捨てる。記録が際限なく増えないように。
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

/** 項目が無ければそのまま返す。 */
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
 * 自動で取得し直す頃合いか。一度も取得していなければ常に真。
 *
 * 利用上限に達して失敗したなら、知らされた再開時刻までは間隔によらず偽。
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
