import { assert, describe, it } from "@effect/vitest"
import { Array, Effect, Layer, Option } from "effect"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import {
  BookmarkId,
  Bookmarks,
  Storage,
  type BookmarkFolderType,
  type BookmarkNode,
} from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { SpaceFolders } from "./space-folders"

const TestLayer = SpaceFolders.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const space = (id: string, name: string = id): Space => ({
  id: SpaceId.make(id),
  name: SpaceName.make(name),
  theme: neutralTheme,
})

const topLevelFolderId = Effect.fnUntraced(
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

const childrenOf = Effect.fnUntraced(function* (folderId: BookmarkId) {
  return yield* (yield* Bookmarks).getChildren(folderId)
})

const titlesOf = (nodes: ReadonlyArray<BookmarkNode>) => nodes.map((node) => node.title)

const createFolder = Effect.fnUntraced(function* (parentId: BookmarkId, title: string) {
  return (yield* (yield* Bookmarks).create({ parentId, title })).id
})

const createBookmark = Effect.fnUntraced(function* (parentId: BookmarkId, title: string) {
  return (yield* (yield* Bookmarks).create({
    parentId,
    title,
    url: `https://example.com/${title}`,
  })).id
})

const exists = Effect.fnUntraced(function* (id: BookmarkId) {
  return Option.isSome(yield* Effect.option((yield* Bookmarks).get(id)))
})

describe("Katip ルートフォルダの確保", () => {
  it.effect("初回は「その他のブックマーク」直下にタイトル Katip のフォルダを作る", () =>
    Effect.gen(function* () {
      const otherBookmarksId = yield* topLevelFolderId("other")

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      const root = yield* (yield* Bookmarks).get(rootId)
      assert.strictEqual(root.title, "Katip")
      assert.deepStrictEqual(root.parentId, Option.some(otherBookmarksId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("「その他のブックマーク」直下に Katip フォルダがすでにあれば、作らずにそれを使う", () =>
    Effect.gen(function* () {
      const otherBookmarksId = yield* topLevelFolderId("other")
      const existingId = yield* createFolder(otherBookmarksId, "Katip")

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      assert.strictEqual(rootId, existingId)
      assert.deepStrictEqual(titlesOf(yield* childrenOf(otherBookmarksId)), ["Katip"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ブックマークバーにある Katip フォルダはルートとみなさない", () =>
    Effect.gen(function* () {
      const barKatipId = yield* createFolder(yield* topLevelFolderId("bookmarks-bar"), "Katip")

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      assert.notStrictEqual(rootId, barKatipId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("一度確保したルートは、改名されても別の場所へ移されても使い続ける", () =>
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const folders = yield* SpaceFolders
      const firstId = yield* folders.ensureRoot
      yield* bookmarks.update(firstId, { title: "別の名前" })
      yield* bookmarks.move(firstId, { parentId: yield* topLevelFolderId("bookmarks-bar") })

      const secondId = yield* folders.ensureRoot

      assert.strictEqual(secondId, firstId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("保存済みのルートが消されていたら新しく作り直し、以後はその ID を使う", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const removedId = yield* folders.ensureRoot
      yield* (yield* Bookmarks).removeTree(removedId)

      const recreatedId = yield* folders.ensureRoot
      const laterId = yield* folders.ensureRoot

      assert.notStrictEqual(recreatedId, removedId)
      assert.strictEqual(laterId, recreatedId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("保存済みの ID が壊れていたら、タイトルで探し直す", () =>
    Effect.gen(function* () {
      const existingId = yield* createFolder(yield* topLevelFolderId("other"), "Katip")
      yield* (yield* Storage).local.set("katip/pinned/root-folder-id", 42)

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      assert.strictEqual(rootId, existingId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("並行して確保しても、ルートは 1 つしか作られない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      const [firstId, secondId] = yield* Effect.all([folders.ensureRoot, folders.ensureRoot], {
        concurrency: "unbounded",
      })

      assert.strictEqual(firstId, secondId)
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* topLevelFolderId("other"))), [
        "Katip",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("Space フォルダの確保", () => {
  it.effect("Katip ルート直下に Space 名のフォルダを作る", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      const folderId = yield* folders.ensureSpaceFolder(space("work", "仕事"))

      const folder = yield* (yield* Bookmarks).get(folderId)
      assert.strictEqual(folder.title, "仕事")
      assert.deepStrictEqual(folder.parentId, Option.some(yield* folders.ensureRoot))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("2 回目以降は同じフォルダを使う", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const firstId = yield* folders.ensureSpaceFolder(space("work"))

      const secondId = yield* folders.ensureSpaceFolder(space("work"))

      assert.strictEqual(secondId, firstId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("並行して確保しても、フォルダは 1 つしか作られない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      const [firstId, secondId] = yield* Effect.all(
        [folders.ensureSpaceFolder(space("work")), folders.ensureSpaceFolder(space("work"))],
        { concurrency: "unbounded" },
      )

      assert.strictEqual(firstId, secondId)
      assert.lengthOf(yield* childrenOf(yield* folders.ensureRoot), 1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダが外部で消されていたら作り直す", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const removedId = yield* folders.ensureSpaceFolder(space("work", "仕事"))
      yield* (yield* Bookmarks).removeTree(removedId)

      const recreatedId = yield* folders.ensureSpaceFolder(space("work", "仕事"))

      assert.notStrictEqual(recreatedId, removedId)
      assert.isTrue(yield* exists(recreatedId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダが Katip の外へ移されていたら、Katip ルート直下に作り直す", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const movedId = yield* folders.ensureSpaceFolder(space("work", "仕事"))
      yield* (yield* Bookmarks).move(movedId, {
        parentId: yield* topLevelFolderId("bookmarks-bar"),
      })

      const recreatedId = yield* folders.ensureSpaceFolder(space("work", "仕事"))

      assert.notStrictEqual(recreatedId, movedId)
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), ["仕事"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("改名するとフォルダ名が新しい Space 名になる", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work", "仕事"))

      yield* folders.renameSpaceFolder(space("work", "本業"))

      assert.strictEqual((yield* (yield* Bookmarks).get(folderId)).title, "本業")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "Space を削除するとフォルダが中身ごと消え、もう一度確保すると新しいフォルダになる",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const folderId = yield* folders.ensureSpaceFolder(space("work"))
        const pinId = yield* createBookmark(folderId, "pin")

        yield* folders.removeSpaceFolder(SpaceId.make("work"))

        assert.isFalse(yield* exists(folderId))
        assert.isFalse(yield* exists(pinId))
        assert.notStrictEqual(yield* folders.ensureSpaceFolder(space("work")), folderId)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外へ移されたフォルダは、Space を削除しても消さない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work"))
      yield* (yield* Bookmarks).move(folderId, {
        parentId: yield* topLevelFolderId("bookmarks-bar"),
      })

      yield* folders.removeSpaceFolder(SpaceId.make("work"))

      assert.isTrue(yield* exists(folderId))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("Space とフォルダの照合", () => {
  it.effect("ブックマークマネージャでフォルダ名を変えると、Space 名がフォルダ名に変わる", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work", "仕事"))
      yield* (yield* Bookmarks).update(folderId, { title: "本業" })

      const spaces = yield* folders.reconcileSpaces([space("work", "仕事")])

      assert.deepStrictEqual(
        spaces.map((s) => s.name),
        ["本業"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "Katip ルート直下に追加されたフォルダから Space が作られ、そのフォルダが Space のフォルダになる",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const addedId = yield* createFolder(yield* folders.ensureRoot, "読書")

        const spaces = yield* folders.reconcileSpaces([])

        assert.deepStrictEqual(
          spaces.map((s) => s.name),
          ["読書"],
        )
        const [discovered] = spaces
        assert.isDefined(discovered)
        assert.strictEqual(yield* folders.ensureSpaceFolder(discovered), addedId)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("名前の無いフォルダから作った Space には既定名が付き、フォルダ名もそれにそろう", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const addedId = yield* createFolder(yield* folders.ensureRoot, "")

      const spaces = yield* folders.reconcileSpaces([])

      const [discovered] = spaces
      assert.isDefined(discovered)
      assert.strictEqual((yield* (yield* Bookmarks).get(addedId)).title, discovered.name)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("フォルダが消えた Space には、Space 名でフォルダが作り直される", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const removedId = yield* folders.ensureSpaceFolder(space("work", "仕事"))
      yield* (yield* Bookmarks).removeTree(removedId)

      const spaces = yield* folders.reconcileSpaces([space("work", "仕事")])

      assert.deepStrictEqual(
        spaces.map((s) => s.name),
        ["仕事"],
      )
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), ["仕事"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip ルートごと消されていたら、ルートとすべての Space のフォルダを作り直す", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureSpaceFolder(space("a", "仕事"))
      yield* (yield* Bookmarks).removeTree(yield* folders.ensureRoot)

      yield* folders.reconcileSpaces([space("a", "仕事"), space("b", "趣味")])

      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), [
        "仕事",
        "趣味",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("対応表を失っても、同じ名前のフォルダと結び直して中のピン留めを保つ", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work", "仕事"))
      yield* (yield* Storage).local.remove("katip/pinned/space-folders")

      yield* folders.reconcileSpaces([space("work", "仕事")])

      assert.strictEqual(yield* folders.ensureSpaceFolder(space("work", "仕事")), folderId)
      assert.lengthOf(yield* childrenOf(yield* folders.ensureRoot), 1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("一度照合した後に続けて照合しても、Space もフォルダも変わらない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* createFolder(yield* folders.ensureRoot, "読書")
      const once = yield* folders.reconcileSpaces([space("work", "仕事")])

      const twice = yield* folders.reconcileSpaces(once)

      assert.deepStrictEqual(twice, once)
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), [
        "読書",
        "仕事",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("Katip 配下かの判定", () => {
  it.effect("Space フォルダの中の深い階層のブックマークは Katip 配下", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const spaceFolderId = yield* folders.ensureSpaceFolder(space("work"))
      const nestedId = yield* createFolder(yield* createFolder(spaceFolderId, "f1"), "f2")
      const pinId = yield* createBookmark(nestedId, "pin")

      assert.isTrue(yield* folders.isWithinKatip(pinId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip ルート自身も Katip 配下", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      assert.isTrue(yield* folders.isWithinKatip(yield* folders.ensureRoot))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("Katip の外のブックマークは Katip 配下ではない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureRoot
      const outsideId = yield* createBookmark(yield* topLevelFolderId("bookmarks-bar"), "outside")

      assert.isFalse(yield* folders.isWithinKatip(outsideId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ルートを確保する前は、どのブックマークも Katip 配下ではない", () =>
    Effect.gen(function* () {
      const katipLookalikeId = yield* createFolder(yield* topLevelFolderId("other"), "Katip")

      assert.isFalse(yield* (yield* SpaceFolders).isWithinKatip(katipLookalikeId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("存在しない ID は Katip 配下ではない", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureRoot

      assert.isFalse(yield* folders.isWithinKatip(BookmarkId.make("missing")))
    }).pipe(Effect.provide(TestLayer)),
  )
})
