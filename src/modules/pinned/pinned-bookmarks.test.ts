import { assert, describe, it } from "@effect/vitest"
import { Array, Effect, Layer, Option } from "effect"
import type { LiveSource } from "#modules/live-folders"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, Bookmarks, type BookmarkFolderType } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { isFolderExpanded } from "./folder-expansion"
import { FolderExpansionStore } from "./folder-expansion-store"
import { LiveFolderStore } from "./live-folder-store"
import { PinnedBookmarks, PinnedParent } from "./pinned-bookmarks"
import type { PinnedNode, PinnedTree } from "./pinned-node"
import { SpaceFolders } from "./space-folders"

const TestLayer = PinnedBookmarks.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const syncOff = { isTabGroupSyncEnabled: false }
const syncOn = { isTabGroupSyncEnabled: true }

const space = (id: string, name: string = id): Space => ({
  id: SpaceId.make(id),
  name: SpaceName.make(name),
  theme: neutralTheme,
})

const work = space("work", "仕事")
const hobby = space("hobby", "趣味")

const spaceRoot = (owner: Space) => PinnedParent.SpaceRoot({ space: owner })
const inFolder = (folderId: BookmarkId) => PinnedParent.Folder({ folderId })

const spaceFolderOf = Effect.fnUntraced(function* (owner: Space) {
  return yield* (yield* SpaceFolders).ensureSpaceFolder(owner)
})

const addFolder = Effect.fnUntraced(function* (parentId: BookmarkId, title: string) {
  return (yield* (yield* Bookmarks).create({ parentId, title })).id
})

const addPin = Effect.fnUntraced(function* (parentId: BookmarkId, title: string) {
  return (yield* (yield* Bookmarks).create({
    parentId,
    title,
    url: `https://example.com/${title}`,
  })).id
})

const outsideFolderId = Effect.fnUntraced(
  function* (folderType: BookmarkFolderType) {
    const tree = yield* (yield* Bookmarks).getTree
    const folder = Array.findFirst(
      Option.getOrElse(tree.children, () => []),
      (node) => node._tag === "BookmarkFolder" && Option.contains(node.folderType, folderType),
    )
    return yield* Effect.fromOption(folder, () => new Error(`${folderType} フォルダが無い`))
  },
  Effect.map((folder) => folder.id),
)

const titlesIn = Effect.fnUntraced(function* (folderId: BookmarkId) {
  return (yield* (yield* Bookmarks).getChildren(folderId)).map((node) => node.title)
})

const exists = Effect.fnUntraced(function* (id: BookmarkId) {
  return Option.isSome(yield* Effect.option((yield* Bookmarks).get(id)))
})

const outline = (tree: PinnedTree): ReadonlyArray<unknown> =>
  tree.map((node: PinnedNode) =>
    node._tag === "PinnedFolder" ? { [node.title]: outline(node.children) } : node.title,
  )

describe("ピン留めツリーの読み込み", () => {
  it.effect("Space フォルダの中身を、フォルダの入れ子と並び順を保って読み込む", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")
      const folderId = yield* addFolder(spaceFolderId, "資料")
      yield* addPin(folderId, "b")
      yield* addPin(spaceFolderId, "c")

      const tree = yield* (yield* PinnedBookmarks).loadSpaceTree(work.id)

      assert.deepStrictEqual(outline(tree), ["a", { 資料: ["b"] }, "c"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダがまだ無い Space は、空ではなく読めないものとして扱う", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* PinnedBookmarks).loadSpaceTree(work.id))

      assert.strictEqual(error._tag, "PinnedTreeUnavailable")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Space のフォルダが外部で消されていたら読めない", () =>
    Effect.gen(function* () {
      yield* (yield* Bookmarks).removeTree(yield* spaceFolderOf(work))

      const error = yield* Effect.flip((yield* PinnedBookmarks).loadSpaceTree(work.id))

      assert.strictEqual(error._tag, "PinnedTreeUnavailable")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("全 Space 分をまとめて読むと、フォルダのある Space のツリーだけが返る", () =>
    Effect.gen(function* () {
      yield* addPin(yield* spaceFolderOf(work), "a")
      yield* spaceFolderOf(hobby)
      yield* (yield* Bookmarks).removeTree(yield* spaceFolderOf(hobby))

      const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees

      assert.deepStrictEqual([...trees.keys()], [work.id])
      assert.deepStrictEqual(outline(trees.get(work.id) ?? []), ["a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip ルートごと消されていたら、まとめて読んでも何も返らない", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      yield* (yield* Bookmarks).removeTree(yield* (yield* SpaceFolders).ensureRoot)

      const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees

      assert.strictEqual(trees.size, 0)
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ノードの位置", () => {
  it.effect("どの Space の、どのフォルダの何番目にあるかが分かる", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "資料")
      yield* addPin(folderId, "a")
      const pinId = yield* addPin(folderId, "b")

      const location = yield* (yield* PinnedBookmarks).locate(pinId)

      assert.strictEqual(location.spaceId, work.id)
      assert.deepStrictEqual(location.parentFolderId, Option.some(folderId))
      assert.strictEqual(location.depth, 2)
      assert.strictEqual(location.index, 1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のブックマークは見つからない", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      const outsideId = yield* addPin(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip((yield* PinnedBookmarks).locate(outsideId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Space フォルダそのものはピン留めのノードとしては見つからない", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)

      const error = yield* Effect.flip((yield* PinnedBookmarks).locate(spaceFolderId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ブックマークの作成", () => {
  it.effect("位置を省略すると Space 直下の末尾に作る", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")

      yield* (yield* PinnedBookmarks).createBookmark(
        { parent: spaceRoot(work) },
        { title: "new", url: "https://example.com/new" },
      )

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["a", "new"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("位置を指定するとその位置に作る", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")
      yield* addPin(spaceFolderId, "b")

      yield* (yield* PinnedBookmarks).createBookmark(
        { parent: spaceRoot(work), index: 1 },
        { title: "new", url: "https://example.com/new" },
      )

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["a", "new", "b"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダの中に作れる", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "資料")

      yield* (yield* PinnedBookmarks).createBookmark(
        { parent: inFolder(folderId) },
        { title: "new", url: "https://example.com/new" },
      )

      assert.deepStrictEqual(yield* titlesIn(folderId), ["new"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Space のフォルダが外部で消されていても、作り直してそこに作る", () =>
    Effect.gen(function* () {
      yield* (yield* Bookmarks).removeTree(yield* spaceFolderOf(work))

      const createdId = yield* (yield* PinnedBookmarks).createBookmark(
        { parent: spaceRoot(work) },
        { title: "new", url: "https://example.com/new" },
      )

      const location = yield* (yield* PinnedBookmarks).locate(createdId)
      assert.strictEqual(location.spaceId, work.id)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のフォルダの中には作れない", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      const outsideId = yield* addFolder(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createBookmark(
          { parent: inFolder(outsideId) },
          { title: "new", url: "https://example.com/new" },
        ),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.deepStrictEqual(yield* titlesIn(outsideId), [])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("フォルダの作成", () => {
  it.effect("作ったフォルダは開いた状態で保存される", () =>
    Effect.gen(function* () {
      const folderId = yield* (yield* PinnedBookmarks).createFolder(
        { parent: spaceRoot(work) },
        { title: "資料" },
        syncOff,
      )

      assert.isTrue(isFolderExpanded(yield* (yield* FolderExpansionStore).load, folderId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("深さ 1 のフォルダの中にフォルダを作れる", () =>
    Effect.gen(function* () {
      const depth1 = yield* addFolder(yield* spaceFolderOf(work), "1")

      yield* (yield* PinnedBookmarks).createFolder(
        { parent: inFolder(depth1) },
        { title: "2" },
        syncOff,
      )

      assert.deepStrictEqual(yield* titlesIn(depth1), ["2"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("深さ 2 のフォルダの中にはフォルダを作れない", () =>
    Effect.gen(function* () {
      const depth2 = yield* addFolder(yield* addFolder(yield* spaceFolderOf(work), "1"), "2")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createFolder(
          { parent: inFolder(depth2) },
          { title: "3" },
          syncOff,
        ),
      )

      assert.strictEqual(error._tag, "FolderDepthExceeded")
      assert.deepStrictEqual(yield* titlesIn(depth2), [])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("タブグループ同期が ON のときは、深さ 1 のフォルダの中にフォルダを作れない", () =>
    Effect.gen(function* () {
      const depth1 = yield* addFolder(yield* spaceFolderOf(work), "1")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createFolder({ parent: inFolder(depth1) }, { title: "2" }, syncOn),
      )

      assert.strictEqual(error._tag, "FolderDepthExceeded")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ブックマークの中にはフォルダを作れない", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createFolder({ parent: inFolder(pinId) }, { title: "x" }, syncOff),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ブックマークの移動", () => {
  it.effect("同じ親の中で後ろへ動かすと、指定した位置に入る", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const a = yield* addPin(spaceFolderId, "a")
      yield* addPin(spaceFolderId, "b")
      yield* addPin(spaceFolderId, "c")

      yield* (yield* PinnedBookmarks).moveBookmark(a, { parent: spaceRoot(work), index: 2 })

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["b", "c", "a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("同じ親の中で前へ動かすと、指定した位置に入る", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")
      yield* addPin(spaceFolderId, "b")
      const c = yield* addPin(spaceFolderId, "c")

      yield* (yield* PinnedBookmarks).moveBookmark(c, { parent: spaceRoot(work), index: 0 })

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["c", "a", "b"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("別の Space のフォルダへ、指定した位置に移せる", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")
      const hobbyFolderId = yield* addFolder(yield* spaceFolderOf(hobby), "資料")
      yield* addPin(hobbyFolderId, "x")

      yield* (yield* PinnedBookmarks).moveBookmark(pinId, {
        parent: inFolder(hobbyFolderId),
        index: 0,
      })

      assert.deepStrictEqual(yield* titlesIn(hobbyFolderId), ["a", "x"])
      assert.strictEqual((yield* (yield* PinnedBookmarks).locate(pinId)).spaceId, hobby.id)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("位置を省略すると移動先の末尾に入る", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const folderId = yield* addFolder(spaceFolderId, "資料")
      const pinId = yield* addPin(spaceFolderId, "a")
      yield* addPin(folderId, "x")

      yield* (yield* PinnedBookmarks).moveBookmark(pinId, { parent: inFolder(folderId) })

      assert.deepStrictEqual(yield* titlesIn(folderId), ["x", "a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のブックマークを移動しようとすると拒否される", () =>
    Effect.gen(function* () {
      const barId = yield* outsideFolderId("bookmarks-bar")
      const outsideId = yield* addPin(barId, "outside")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveBookmark(outsideId, { parent: spaceRoot(work) }),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.deepStrictEqual(yield* titlesIn(barId), ["outside"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のフォルダへは移せない", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")
      const outsideId = yield* addFolder(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveBookmark(pinId, { parent: inFolder(outsideId) }),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.deepStrictEqual(yield* titlesIn(outsideId), [])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダは移動できない", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "資料")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveBookmark(folderId, { parent: spaceRoot(hobby) }),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("改名と更新", () => {
  it.effect("ブックマークもフォルダも改名できる", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const pinId = yield* addPin(spaceFolderId, "a")
      const folderId = yield* addFolder(spaceFolderId, "f")
      const pinned = yield* PinnedBookmarks

      yield* pinned.rename(pinId, "ピン")
      yield* pinned.rename(folderId, "フォルダ")

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["ピン", "フォルダ"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Space フォルダはピン留めの改名では変えられない", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)

      const error = yield* Effect.flip((yield* PinnedBookmarks).rename(spaceFolderId, "x"))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.strictEqual((yield* (yield* Bookmarks).get(spaceFolderId)).title, "仕事")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ブックマークの URL とタイトルを置き換えられる", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      yield* (yield* PinnedBookmarks).updateBookmark(pinId, {
        title: "新しいページ",
        url: "https://example.com/new",
      })

      const updated = yield* (yield* Bookmarks).get(pinId)
      assert.strictEqual(updated.title, "新しいページ")
      assert.deepStrictEqual(updated._tag === "Bookmark" && updated.url, "https://example.com/new")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダに URL は設定できない", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "資料")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).updateBookmark(folderId, { title: "x", url: "https://x.test/" }),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("削除", () => {
  it.effect("ブックマークを削除できる", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      yield* (yield* PinnedBookmarks).removeBookmark(pinId)

      assert.isFalse(yield* exists(pinId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ブックマークの削除ではフォルダを消せない", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "資料")

      const error = yield* Effect.flip((yield* PinnedBookmarks).removeBookmark(folderId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.isTrue(yield* exists(folderId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のブックマークは削除できない", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      const outsideId = yield* addPin(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip((yield* PinnedBookmarks).removeBookmark(outsideId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.isTrue(yield* exists(outsideId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダを中身ごと削除し、配下のフォルダの開閉状態も捨てる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const store = yield* FolderExpansionStore
      const outer = yield* pinned.createFolder({ parent: spaceRoot(work) }, { title: "1" }, syncOff)
      const inner = yield* pinned.createFolder({ parent: inFolder(outer) }, { title: "2" }, syncOff)
      const pinId = yield* addPin(inner, "a")

      yield* pinned.removeFolder(outer)

      assert.isFalse(yield* exists(outer))
      assert.isFalse(yield* exists(pinId))
      assert.deepStrictEqual(yield* store.load, {})
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("分割ビューのピン留め", () => {
  const draft = {
    title: "メール | 予定",
    left: { title: "メール", url: "https://mail.example/" },
    right: { title: "予定", url: "https://calendar.example/" },
  }

  it.effect("2 つのブックマークを持つ分割ピンとして作られ、ツリーで 1 つのピンとして読める", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks

      yield* pinned.createSplit({ parent: spaceRoot(work) }, draft)
      const tree = yield* pinned.loadSpaceTree(work.id)

      assert.deepStrictEqual(
        tree.map((node) =>
          node._tag === "PinnedSplit" ? [node.title, node.items.map((item) => item.title)] : node,
        ),
        [["メール | 予定", ["メール", "予定"]]],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("深さの上限に達したフォルダの中にも作れる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder({ parent: spaceRoot(work) }, { title: "外" }, syncOn)

      const created = yield* pinned.createSplit({ parent: inFolder(outer) }, draft)
      const location = yield* pinned.locate(created.folderId)

      assert.deepStrictEqual([location.node._tag, location.depth], ["PinnedSplit", 2])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("別の Space のフォルダへ移せる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const created = yield* pinned.createSplit({ parent: spaceRoot(work) }, draft)
      const folder = yield* pinned.createFolder(
        { parent: spaceRoot(hobby) },
        { title: "旅" },
        syncOff,
      )

      yield* pinned.moveBookmark(created.folderId, { parent: inFolder(folder) })
      const location = yield* pinned.locate(created.folderId)

      assert.deepStrictEqual(
        [location.spaceId, location.parentFolderId, location.node._tag],
        [hobby.id, Option.some(folder), "PinnedSplit"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("削除すると中の 2 つのブックマークも消える", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const created = yield* pinned.createSplit({ parent: spaceRoot(work) }, draft)

      yield* pinned.removeBookmark(created.folderId)

      assert.deepStrictEqual(
        [
          yield* exists(created.folderId),
          yield* exists(created.left),
          yield* exists(created.right),
        ],
        [false, false, false],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("ライブフォルダ", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const draft = { title: "レビュー依頼", source: reviews }

  it.effect("取得元を持つライブフォルダとして作られ、開いた状態で保存される", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks

      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)
      const tree = yield* pinned.loadSpaceTree(work.id)

      assert.deepStrictEqual(
        [tree, isFolderExpanded(yield* (yield* FolderExpansionStore).load, folderId)],
        [
          [{ _tag: "PinnedLiveFolder", id: folderId, title: "レビュー依頼", source: reviews }],
          true,
        ],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("深さの上限に達したフォルダの中にも作れる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder({ parent: spaceRoot(work) }, { title: "外" }, syncOn)

      const folderId = yield* pinned.createLiveFolder({ parent: inFolder(outer) }, draft)
      const location = yield* pinned.locate(folderId)

      assert.deepStrictEqual([location.node._tag, location.depth], ["PinnedLiveFolder", 2])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("別の Space のフォルダへ移せる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)
      const folder = yield* pinned.createFolder(
        { parent: spaceRoot(hobby) },
        { title: "旅" },
        syncOff,
      )

      yield* pinned.moveBookmark(folderId, { parent: inFolder(folder) })
      const location = yield* pinned.locate(folderId)

      assert.deepStrictEqual(
        [location.spaceId, location.parentFolderId, location.node._tag],
        [hobby.id, Option.some(folder), "PinnedLiveFolder"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("改名できる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)

      yield* pinned.rename(folderId, "見てほしい PR")

      assert.strictEqual((yield* pinned.locate(folderId)).node.title, "見てほしい PR")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("中にブックマークは作れない", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)

      const error = yield* Effect.flip(
        pinned.createBookmark(
          { parent: inFolder(folderId) },
          { title: "a", url: "https://example.com/" },
        ),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("削除するとフォルダが消え、印と開閉状態も捨てる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)

      yield* pinned.removeBookmark(folderId)

      assert.deepStrictEqual(
        [
          yield* exists(folderId),
          (yield* (yield* LiveFolderStore).load).size,
          yield* (yield* FolderExpansionStore).load,
        ],
        [false, 0, {}],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("中にあるフォルダを削除すると、ライブフォルダの印と開閉状態も捨てる", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder(
        { parent: spaceRoot(work) },
        { title: "外" },
        syncOff,
      )
      yield* pinned.createLiveFolder({ parent: inFolder(outer) }, draft)

      yield* pinned.removeFolder(outer)

      assert.deepStrictEqual(
        [(yield* (yield* LiveFolderStore).load).size, yield* (yield* FolderExpansionStore).load],
        [0, {}],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})
