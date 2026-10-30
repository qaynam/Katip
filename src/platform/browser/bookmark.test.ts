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

describe("Chrome のブックマークノードの変換", () => {
  it("URL を持つノードはブックマークになる", () => {
    const node = fromChromeBookmark(chromeBookmark("https://example.com/"))

    assert.strictEqual(node._tag, "Bookmark")
  })

  it("URL を持たないノードはフォルダになる", () => {
    const node = fromChromeBookmark(chromeFolder())

    assert.strictEqual(node._tag, "BookmarkFolder")
  })

  it("子を返さなかったフォルダは、子を読み込んでいないことを表す", () => {
    const node = fromChromeBookmark(chromeFolder())

    assert.deepStrictEqual(folderChildren(node), Option.some(Option.none()))
  })

  it("子を返したフォルダは子も変換する", () => {
    const node = fromChromeBookmark(chromeFolder([chromeBookmark("https://example.com/")]))

    assert.deepStrictEqual(
      Option.map(Option.flatten(folderChildren(node)), (children) => children.map(({ id }) => id)),
      Option.some([BookmarkId.make("11")]),
    )
  })

  it("ルートには親も位置も無い", () => {
    const node = fromChromeBookmark({ id: "0", title: "", syncing: false, children: [] })

    assert.deepStrictEqual([node.parentId, node.index], [Option.none(), Option.none()])
  })
})
