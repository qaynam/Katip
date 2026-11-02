import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { type BookmarkNode, fromChromeBookmark } from "./bookmark"
import { BookmarkId } from "./ids"

const chromeBookmark = (url: string): chrome.bookmarks.BookmarkTreeNode => ({
  id: "11",
  parentId: "10",
  index: 0,
  title: "Bookmark",
  syncing: false,
  url,
})

const chromeFolder = (
  children?: ReadonlyArray<chrome.bookmarks.BookmarkTreeNode>,
): chrome.bookmarks.BookmarkTreeNode => ({
  id: "10",
  parentId: "2",
  index: 0,
  title: "Folder",
  syncing: false,
  ...(children !== undefined && { children: [...children] }),
})

const folderChildren = (node: BookmarkNode) =>
  node._tag === "BookmarkFolder" ? Option.some(node.children) : Option.none()

describe("converting a Chrome bookmark node", () => {
  it("a node with a URL becomes a bookmark", () => {
    const node = fromChromeBookmark(chromeBookmark("https://example.com/"))

    assert.strictEqual(node._tag, "Bookmark")
  })

  it("a node without a URL becomes a folder", () => {
    const node = fromChromeBookmark(chromeFolder())

    assert.strictEqual(node._tag, "BookmarkFolder")
  })

  it("a folder returned without children has its children not loaded", () => {
    const node = fromChromeBookmark(chromeFolder())

    assert.deepStrictEqual(folderChildren(node), Option.some(Option.none()))
  })

  it("a folder returned with children converts them too", () => {
    const node = fromChromeBookmark(chromeFolder([chromeBookmark("https://example.com/")]))

    assert.deepStrictEqual(
      Option.map(Option.flatten(folderChildren(node)), (children) => children.map(({ id }) => id)),
      Option.some([BookmarkId.make("11")]),
    )
  })

  it("the root has neither a parent nor an index", () => {
    const node = fromChromeBookmark({ id: "0", title: "", syncing: false, children: [] })

    assert.deepStrictEqual([node.parentId, node.index], [Option.none(), Option.none()])
  })
})
