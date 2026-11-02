import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { LiveSource } from "#modules/live-folders"
import { BookmarkId, type BookmarkFolder, type BookmarkNode } from "#platform/browser"
import {
  findPinnedNode,
  folderHeight,
  folderIdsWithin,
  liveFoldersIn,
  pinnedTreeFrom,
  type PinnedBookmark,
  type PinnedFolder,
  type PinnedNode,
} from "./pinned-node"

const bookmarkId = (value: string) => BookmarkId.make(value)

const chromeBookmark = (id: string, title = id): BookmarkNode => ({
  _tag: "Bookmark",
  id: bookmarkId(id),
  parentId: Option.none(),
  index: Option.none(),
  title,
  dateAdded: Option.none(),
  url: `https://example.com/${id}`,
})

const chromeFolder = (
  id: string,
  children: Option.Option<ReadonlyArray<BookmarkNode>>,
  title = id,
): BookmarkFolder => ({
  _tag: "BookmarkFolder",
  id: bookmarkId(id),
  parentId: Option.none(),
  index: Option.none(),
  title,
  dateAdded: Option.none(),
  folderType: Option.none(),
  children,
})

const loadedFolder = (id: string, children: ReadonlyArray<BookmarkNode>, title = id) =>
  chromeFolder(id, Option.some(children), title)

const pin = (id: string): PinnedNode => ({
  _tag: "PinnedBookmark",
  id: bookmarkId(id),
  title: id,
  url: `https://example.com/${id}`,
})

const pinFolder = (id: string, children: ReadonlyArray<PinnedNode>): PinnedFolder => ({
  _tag: "PinnedFolder",
  id: bookmarkId(id),
  title: id,
  children,
})

describe("converting a Space folder's subtree into a pinned tree", () => {
  it("a bookmark becomes a pin with its ID, title and URL", () => {
    const spaceFolder = loadedFolder("space", [chromeBookmark("b1", "Docs")])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(
      Option.some([
        {
          _tag: "PinnedBookmark",
          id: "b1",
          title: "Docs",
          url: "https://example.com/b1",
        },
      ]),
    )
  })

  it("a folder becomes a pinned folder holding its contents in the same order", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("f1", [chromeBookmark("b2"), chromeBookmark("b1")]),
    ])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(Option.some([pinFolder("f1", [pin("b2"), pin("b1")])]))
  })

  it("an empty folder becomes a pinned folder with no children", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("f1", [])])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(Option.some([pinFolder("f1", [])]))
  })

  it("an empty Space folder becomes an empty tree", () => {
    expect(pinnedTreeFrom(loadedFolder("space", []))).toStrictEqual(Option.some([]))
  })

  it("folders nested three or more levels deep outside Katip are converted as they are", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("f1", [loadedFolder("f2", [loadedFolder("f3", [chromeBookmark("b1")])])]),
    ])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(
      Option.some([pinFolder("f1", [pinFolder("f2", [pinFolder("f3", [pin("b1")])])])]),
    )
  })

  it("returns no partial result when a folder inside has its children unloaded", () => {
    const spaceFolder = loadedFolder("space", [
      chromeBookmark("b1"),
      chromeFolder("f1", Option.none()),
    ])

    expect(pinnedTreeFrom(spaceFolder)).toStrictEqual(Option.none())
  })

  it("returns no result when the Space folder's own children are unloaded", () => {
    expect(pinnedTreeFrom(chromeFolder("space", Option.none()))).toStrictEqual(Option.none())
  })
})

describe("finding a node in a pinned tree", () => {
  const tree = [pin("b1"), pinFolder("f1", [pin("b2"), pinFolder("f2", [pin("b3")])]), pin("b4")]

  it("a node directly inside the Space is found with no parent folder, at depth 1", () => {
    const found = findPinnedNode(tree, bookmarkId("b4"))

    expect(found).toStrictEqual(
      Option.some({ node: pin("b4"), parentFolderId: Option.none(), depth: 1, index: 2 }),
    )
  })

  it("a node inside a folder is found with the folder's ID as its parent, at depth 2", () => {
    const found = findPinnedNode(tree, bookmarkId("b2"))

    expect(found).toStrictEqual(
      Option.some({
        node: pin("b2"),
        parentFolderId: Option.some(bookmarkId("f1")),
        depth: 2,
        index: 0,
      }),
    )
  })

  it("a node inside a folder at depth 2 is found at depth 3", () => {
    const found = findPinnedNode(tree, bookmarkId("b3"))

    expect(Option.map(found, (location) => location.depth)).toStrictEqual(Option.some(3))
  })

  it("a folder itself is found too, with its depth", () => {
    const found = findPinnedNode(tree, bookmarkId("f2"))

    expect(
      Option.map(found, (location) => [location.node._tag, location.depth] as const),
    ).toStrictEqual(Option.some(["PinnedFolder", 2]))
  })

  it("an ID not in the tree isn't found", () => {
    expect(findPinnedNode(tree, bookmarkId("missing"))).toStrictEqual(Option.none())
  })

  it("nothing is found in an empty tree", () => {
    expect(findPinnedNode([], bookmarkId("b1"))).toStrictEqual(Option.none())
  })
})

describe("folder IDs within a folder", () => {
  it("returns the IDs of the folder itself and of the folders at every level inside it", () => {
    const folder = pinFolder("f1", [pinFolder("f2", [pinFolder("f3", [])]), pinFolder("f4", [])])

    expect(folderIdsWithin(folder)).toStrictEqual(["f1", "f2", "f3", "f4"])
  })

  it("leaves out bookmark IDs", () => {
    const folder = pinFolder("f1", [pin("b1"), pinFolder("f2", [pin("b2")])])

    expect(folderIdsWithin(folder)).toStrictEqual(["f1", "f2"])
  })
})

describe("folders pinned as a split view", () => {
  const splitIds = new Set([bookmarkId("split")])

  it("a marked folder holding two bookmarks becomes a split pin, left then right", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("split", [chromeBookmark("left"), chromeBookmark("right")], "Left | Right"),
    ])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(
      Option.some([
        {
          _tag: "PinnedSplit",
          id: bookmarkId("split"),
          title: "Left | Right",
          items: [pin("left"), pin("right")],
        },
      ]),
    )
  })

  it("a marked folder that no longer holds two bookmarks becomes an ordinary folder", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("split", [chromeBookmark("only")])])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(Option.some([pinFolder("split", [pin("only")])]))
  })

  it("an unmarked folder stays an ordinary folder even when it holds two bookmarks", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("folder", [chromeBookmark("a"), chromeBookmark("b")]),
    ])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(Option.some([pinFolder("folder", [pin("a"), pin("b")])]))
  })

  it("a bookmark inside a split pin is found with the split pin as its parent", () => {
    const tree = Option.getOrThrow(
      pinnedTreeFrom(
        loadedFolder("space", [
          loadedFolder("split", [chromeBookmark("left"), chromeBookmark("right")]),
        ]),
        { splitFolders: splitIds },
      ),
    )

    const found = findPinnedNode(tree, bookmarkId("right"))

    expect(Option.map(found, (l) => [l.parentFolderId, l.index])).toStrictEqual(
      Option.some([Option.some(bookmarkId("split")), 1]),
    )
  })
})

describe("folders created as live folders", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const liveFolders = new Map([[bookmarkId("live"), reviews]])

  it("a marked empty folder becomes a live folder with its source", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("live", [], "Reviews")])

    const tree = pinnedTreeFrom(spaceFolder, { liveFolders })

    expect(tree).toStrictEqual(
      Option.some([
        { _tag: "PinnedLiveFolder", id: bookmarkId("live"), title: "Reviews", source: reviews },
      ]),
    )
  })

  it("a marked folder that had bookmarks put in it outside Katip shows them as an ordinary folder", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("live", [chromeBookmark("stray")])])

    const tree = pinnedTreeFrom(spaceFolder, { liveFolders })

    expect(tree).toStrictEqual(Option.some([pinFolder("live", [pin("stray")])]))
  })

  it("a live folder inside a folder is found with that folder as its parent", () => {
    const tree = Option.getOrThrow(
      pinnedTreeFrom(loadedFolder("space", [loadedFolder("f1", [loadedFolder("live", [])])]), {
        liveFolders,
      }),
    )

    const found = findPinnedNode(tree, bookmarkId("live"))

    expect(
      Option.map(found, (l) => [l.node._tag, l.parentFolderId, l.depth] as const),
    ).toStrictEqual(Option.some(["PinnedLiveFolder", Option.some(bookmarkId("f1")), 2]))
  })

  it("collects the live folders at every level of the tree, from the top down", () => {
    const tree = Option.getOrThrow(
      pinnedTreeFrom(
        loadedFolder("space", [
          loadedFolder("f1", [loadedFolder("inner", [])]),
          loadedFolder("outer", []),
          chromeBookmark("b1"),
        ]),
        {
          liveFolders: new Map([
            [bookmarkId("outer"), reviews],
            [bookmarkId("inner"), reviews],
          ]),
        },
      ),
    )

    expect(liveFoldersIn(tree).map((live) => live.id)).toStrictEqual(["inner", "outer"])
  })
})

describe("folder height", () => {
  const bookmarkPin = (id: string): PinnedBookmark => ({
    _tag: "PinnedBookmark",
    id: bookmarkId(id),
    title: id,
    url: `https://example.com/${id}`,
  })

  it("a folder with no folders inside is one level high", () => {
    expect(folderHeight(pinFolder("f1", [pin("b1")]))).toBe(1)
  })

  it("is as high as its deepest branch", () => {
    const folder = pinFolder("f1", [
      pinFolder("f2", []),
      pinFolder("f3", [pinFolder("f4", [pin("b1")])]),
    ])

    expect(folderHeight(folder)).toBe(3)
  })

  it("split pins and live folders don't count as levels", () => {
    const folder = pinFolder("f1", [
      {
        _tag: "PinnedSplit",
        id: bookmarkId("split"),
        title: "split",
        items: [bookmarkPin("left"), bookmarkPin("right")],
      },
      {
        _tag: "PinnedLiveFolder",
        id: bookmarkId("live"),
        title: "live",
        source: { _tag: "GitHub", query: "mentioned" },
      },
    ])

    expect(folderHeight(folder)).toBe(1)
  })
})
