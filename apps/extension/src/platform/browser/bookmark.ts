import { Option, Schema } from "effect"
import { BookmarkId } from "./ids"

export const BookmarkFolderType = Schema.Literals(["bookmarks-bar", "other", "mobile", "managed"])
export type BookmarkFolderType = typeof BookmarkFolderType.Type

const nodeFields = {
  id: BookmarkId,
  parentId: Schema.OptionFromNullOr(BookmarkId),
  index: Schema.OptionFromNullOr(Schema.Int),
  title: Schema.String,
  dateAdded: Schema.OptionFromNullOr(Schema.Number),
}

export const Bookmark = Schema.TaggedStruct("Bookmark", { ...nodeFields, url: Schema.String })
export type Bookmark = typeof Bookmark.Type

export interface BookmarkFolder {
  readonly _tag: "BookmarkFolder"
  readonly id: BookmarkId
  readonly parentId: Option.Option<BookmarkId>
  readonly index: Option.Option<number>
  readonly title: string
  readonly dateAdded: Option.Option<number>
  readonly folderType: Option.Option<BookmarkFolderType>
  /**
   * `Some` only from the APIs that fetch children (`getTree`, `getSubTree`, the removal event).
   * `None` means "children not loaded", not "no children".
   */
  readonly children: Option.Option<ReadonlyArray<BookmarkNode>>
}

interface BookmarkFolderEncoded {
  readonly _tag: "BookmarkFolder"
  readonly id: string
  readonly parentId: string | null
  readonly index: number | null
  readonly title: string
  readonly dateAdded: number | null
  readonly folderType: BookmarkFolderType | null
  readonly children: ReadonlyArray<BookmarkNodeEncoded> | null
}

export type BookmarkNode = Bookmark | BookmarkFolder
type BookmarkNodeEncoded = typeof Bookmark.Encoded | BookmarkFolderEncoded

export const BookmarkFolder = Schema.TaggedStruct("BookmarkFolder", {
  ...nodeFields,
  folderType: Schema.OptionFromNullOr(BookmarkFolderType),
  children: Schema.OptionFromNullOr(
    Schema.Array(
      Schema.suspend((): Schema.Codec<BookmarkNode, BookmarkNodeEncoded> => BookmarkNode),
    ),
  ),
})

export const BookmarkNode = Schema.Union([Bookmark, BookmarkFolder])

export const fromChromeBookmark = (raw: chrome.bookmarks.BookmarkTreeNode): BookmarkNode => {
  const fields = {
    id: BookmarkId.make(raw.id),
    parentId: Option.map(Option.fromNullishOr(raw.parentId), (id) => BookmarkId.make(id)),
    index: Option.fromNullishOr(raw.index),
    title: raw.title,
    dateAdded: Option.fromNullishOr(raw.dateAdded),
  }
  return raw.url === undefined
    ? {
        _tag: "BookmarkFolder",
        ...fields,
        folderType: Option.fromNullishOr(raw.folderType),
        children: Option.map(Option.fromNullishOr(raw.children), (children) =>
          children.map(fromChromeBookmark),
        ),
      }
    : { _tag: "Bookmark", ...fields, url: raw.url }
}
