import { Array, Order, pipe, Schema } from "effect"
import type { SpaceId } from "#modules/space"
import { ArchiveEntry, type ArchiveEntryId } from "./archive-entry"

export const ARCHIVE_CAPACITY = 100

/** アーカイブ日時の新しい順に並んだエントリ。URL は重複しない。 */
export const ArchiveList = Schema.Array(ArchiveEntry)
export type ArchiveList = typeof ArchiveList.Type

const withTitleFallback = (entry: ArchiveEntry): ArchiveEntry =>
  entry.title.trim() === "" ? { ...entry, title: entry.url } : entry

/**
 * エントリを追加する。同じ URL の既存エントリは追加するエントリで置き換え、上限を超えた分は
 * 古いものから捨てる。タイトルが空なら URL をタイトルにする。
 */
export const addArchiveEntry = (archive: ArchiveList, entry: ArchiveEntry): ArchiveList =>
  pipe(
    archive,
    Array.filter((existing) => existing.url !== entry.url),
    // 並べ替えは安定なので、先頭に置いておけば同じ日時の既存エントリより前に並ぶ
    Array.prepend(withTitleFallback(entry)),
    Array.sortWith((e) => e.archivedAt, Order.flip(Order.Number)),
    Array.take(ARCHIVE_CAPACITY),
  )

export const removeArchiveEntry = (archive: ArchiveList, id: ArchiveEntryId): ArchiveList =>
  archive.filter((entry) => entry.id !== id)

export const archiveEntriesInSpace = (archive: ArchiveList, spaceId: SpaceId): ArchiveList =>
  archive.filter((entry) => entry.spaceId === spaceId)
