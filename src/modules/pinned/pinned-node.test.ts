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

describe("Space フォルダのサブツリーからピン留めツリーへの変換", () => {
  it("ブックマークは ID・タイトル・URL を持つピンになる", () => {
    const spaceFolder = loadedFolder("space", [chromeBookmark("b1", "ドキュメント")])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(
      Option.some([
        {
          _tag: "PinnedBookmark",
          id: "b1",
          title: "ドキュメント",
          url: "https://example.com/b1",
        },
      ]),
    )
  })

  it("フォルダは中身を同じ順序で持つピン留めフォルダになる", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("f1", [chromeBookmark("b2"), chromeBookmark("b1")]),
    ])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(Option.some([pinFolder("f1", [pin("b2"), pin("b1")])]))
  })

  it("空のフォルダは子を持たないピン留めフォルダになる", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("f1", [])])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(Option.some([pinFolder("f1", [])]))
  })

  it("Space フォルダが空なら空のツリーになる", () => {
    expect(pinnedTreeFrom(loadedFolder("space", []))).toStrictEqual(Option.some([]))
  })

  it("外部で作られた 3 階層以上のフォルダもそのまま変換する", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("f1", [loadedFolder("f2", [loadedFolder("f3", [chromeBookmark("b1")])])]),
    ])

    const tree = pinnedTreeFrom(spaceFolder)

    expect(tree).toStrictEqual(
      Option.some([pinFolder("f1", [pinFolder("f2", [pinFolder("f3", [pin("b1")])])])]),
    )
  })

  it("子を読み込んでいないフォルダが含まれていたら、一部だけの結果を返さない", () => {
    const spaceFolder = loadedFolder("space", [
      chromeBookmark("b1"),
      chromeFolder("f1", Option.none()),
    ])

    expect(pinnedTreeFrom(spaceFolder)).toStrictEqual(Option.none())
  })

  it("Space フォルダ自体の子を読み込んでいなければ、結果を返さない", () => {
    expect(pinnedTreeFrom(chromeFolder("space", Option.none()))).toStrictEqual(Option.none())
  })
})

describe("ピン留めツリーからのノードの検索", () => {
  const tree = [pin("b1"), pinFolder("f1", [pin("b2"), pinFolder("f2", [pin("b3")])]), pin("b4")]

  it("Space 直下のノードは、親フォルダ無し・深さ 1 で見つかる", () => {
    const found = findPinnedNode(tree, bookmarkId("b4"))

    expect(found).toStrictEqual(
      Option.some({ node: pin("b4"), parentFolderId: Option.none(), depth: 1, index: 2 }),
    )
  })

  it("フォルダの中のノードは、親フォルダの ID・深さ 2 で見つかる", () => {
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

  it("深さ 2 のフォルダの中のノードは深さ 3 で見つかる", () => {
    const found = findPinnedNode(tree, bookmarkId("b3"))

    expect(Option.map(found, (location) => location.depth)).toStrictEqual(Option.some(3))
  })

  it("フォルダ自体も、その深さとともに見つかる", () => {
    const found = findPinnedNode(tree, bookmarkId("f2"))

    expect(
      Option.map(found, (location) => [location.node._tag, location.depth] as const),
    ).toStrictEqual(Option.some(["PinnedFolder", 2]))
  })

  it("ツリーに無い ID は見つからない", () => {
    expect(findPinnedNode(tree, bookmarkId("missing"))).toStrictEqual(Option.none())
  })

  it("空のツリーからは何も見つからない", () => {
    expect(findPinnedNode([], bookmarkId("b1"))).toStrictEqual(Option.none())
  })
})

describe("フォルダ配下のフォルダ ID", () => {
  it("フォルダ自身と、配下のすべての階層のフォルダの ID を返す", () => {
    const folder = pinFolder("f1", [pinFolder("f2", [pinFolder("f3", [])]), pinFolder("f4", [])])

    expect(folderIdsWithin(folder)).toStrictEqual(["f1", "f2", "f3", "f4"])
  })

  it("ブックマークの ID は含めない", () => {
    const folder = pinFolder("f1", [pin("b1"), pinFolder("f2", [pin("b2")])])

    expect(folderIdsWithin(folder)).toStrictEqual(["f1", "f2"])
  })
})

describe("分割ビューとしてピン留めしたフォルダ", () => {
  const splitIds = new Set([bookmarkId("split")])

  it("印の付いたフォルダの中身が 2 つのブックマークなら、左右の順で分割ピンになる", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("split", [chromeBookmark("left"), chromeBookmark("right")], "左 | 右"),
    ])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(
      Option.some([
        {
          _tag: "PinnedSplit",
          id: bookmarkId("split"),
          title: "左 | 右",
          items: [pin("left"), pin("right")],
        },
      ]),
    )
  })

  it("印の付いたフォルダでも、中身が 2 つのブックマークでなくなっていたら普通のフォルダになる", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("split", [chromeBookmark("only")])])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(Option.some([pinFolder("split", [pin("only")])]))
  })

  it("印の無いフォルダは、中身が 2 つのブックマークでも普通のフォルダになる", () => {
    const spaceFolder = loadedFolder("space", [
      loadedFolder("folder", [chromeBookmark("a"), chromeBookmark("b")]),
    ])

    const tree = pinnedTreeFrom(spaceFolder, { splitFolders: splitIds })

    expect(tree).toStrictEqual(Option.some([pinFolder("folder", [pin("a"), pin("b")])]))
  })

  it("分割ピンの中のブックマークも、分割ピンを親として見つかる", () => {
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

describe("ライブフォルダとして作ったフォルダ", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const liveFolders = new Map([[bookmarkId("live"), reviews]])

  it("印の付いた空のフォルダは、取得元を持つライブフォルダになる", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("live", [], "レビュー")])

    const tree = pinnedTreeFrom(spaceFolder, { liveFolders })

    expect(tree).toStrictEqual(
      Option.some([
        { _tag: "PinnedLiveFolder", id: bookmarkId("live"), title: "レビュー", source: reviews },
      ]),
    )
  })

  it("印の付いたフォルダでも、外でブックマークを入れられていたら普通のフォルダとして中身を見せる", () => {
    const spaceFolder = loadedFolder("space", [loadedFolder("live", [chromeBookmark("stray")])])

    const tree = pinnedTreeFrom(spaceFolder, { liveFolders })

    expect(tree).toStrictEqual(Option.some([pinFolder("live", [pin("stray")])]))
  })

  it("フォルダの中にあるライブフォルダも、フォルダを親として見つかる", () => {
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

  it("ツリーのすべての階層のライブフォルダを、上から順に集める", () => {
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

describe("フォルダの段数", () => {
  const bookmarkPin = (id: string): PinnedBookmark => ({
    _tag: "PinnedBookmark",
    id: bookmarkId(id),
    title: id,
    url: `https://example.com/${id}`,
  })

  it("中にフォルダの無いフォルダは 1 段", () => {
    expect(folderHeight(pinFolder("f1", [pin("b1")]))).toBe(1)
  })

  it("いちばん深い枝の段数になる", () => {
    const folder = pinFolder("f1", [
      pinFolder("f2", []),
      pinFolder("f3", [pinFolder("f4", [pin("b1")])]),
    ])

    expect(folderHeight(folder)).toBe(3)
  })

  it("分割ピンとライブフォルダは段に数えない", () => {
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
