import { Array, Order, pipe, Schema } from "effect"
import type { SpaceId } from "#modules/space"
import { ArchiveEntry, type ArchiveEntryId } from "./archive-entry"

export const ARCHIVE_CAPACITY = 100

/** Entries, most recently archived first. No two share a URL. */
export const ArchiveList = Schema.Array(ArchiveEntry)
export type ArchiveList = typeof ArchiveList.Type

const withTitleFallback = (entry: ArchiveEntry): ArchiveEntry =>
  entry.title.trim() === "" ? { ...entry, title: entry.url } : entry

/**
 * Adds an entry. It replaces an existing entry with the same URL, and the oldest entries beyond the
 * capacity are dropped. A blank title becomes the URL.
 */
export const addArchiveEntry = (archive: ArchiveList, entry: ArchiveEntry): ArchiveList =>
  pipe(
    archive,
    Array.filter((existing) => existing.url !== entry.url),
    // The sort is stable, so prepending puts it before existing entries archived at the same time
    Array.prepend(withTitleFallback(entry)),
    Array.sortWith((e) => e.archivedAt, Order.flip(Order.Number)),
    Array.take(ARCHIVE_CAPACITY),
  )

export const removeArchiveEntry = (archive: ArchiveList, id: ArchiveEntryId): ArchiveList =>
  archive.filter((entry) => entry.id !== id)

export const archiveEntriesInSpace = (archive: ArchiveList, spaceId: SpaceId): ArchiveList =>
  archive.filter((entry) => entry.spaceId === spaceId)
