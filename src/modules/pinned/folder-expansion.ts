import { Option, Record, Schema } from "effect"
import { BookmarkId } from "#platform/browser"

export const FolderExpansion = Schema.Record(BookmarkId, Schema.Boolean)
export type FolderExpansion = typeof FolderExpansion.Type

/** 保存値の無いフォルダは閉じているものとして扱う。 */
export const isFolderExpanded = (expansion: FolderExpansion, folderId: BookmarkId): boolean =>
  Option.getOrElse(Record.get(expansion, folderId), () => false)
