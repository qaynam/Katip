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

const numbered = (number: number) => `Space ${number}`

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
    return yield* Effect.fromOption(folder, () => new Error(`no ${folderType} folder`))
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

describe("ensuring the Katip root folder", () => {
  it.effect("the first time, creates a folder titled Katip directly inside Other Bookmarks", () =>
    Effect.gen(function* () {
      const otherBookmarksId = yield* topLevelFolderId("other")

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      const root = yield* (yield* Bookmarks).get(rootId)
      assert.strictEqual(root.title, "Katip")
      assert.deepStrictEqual(root.parentId, Option.some(otherBookmarksId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "uses an existing Katip folder directly inside Other Bookmarks instead of creating one",
    () =>
      Effect.gen(function* () {
        const otherBookmarksId = yield* topLevelFolderId("other")
        const existingId = yield* createFolder(otherBookmarksId, "Katip")

        const rootId = yield* (yield* SpaceFolders).ensureRoot

        assert.strictEqual(rootId, existingId)
        assert.deepStrictEqual(titlesOf(yield* childrenOf(otherBookmarksId)), ["Katip"])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Katip folder on the bookmarks bar doesn't count as the root", () =>
    Effect.gen(function* () {
      const barKatipId = yield* createFolder(yield* topLevelFolderId("bookmarks-bar"), "Katip")

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      assert.notStrictEqual(rootId, barKatipId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("keeps using the root once ensured, even after it is renamed and moved elsewhere", () =>
    Effect.gen(function* () {
      const bookmarks = yield* Bookmarks
      const folders = yield* SpaceFolders
      const firstId = yield* folders.ensureRoot
      yield* bookmarks.update(firstId, { title: "Another name" })
      yield* bookmarks.move(firstId, { parentId: yield* topLevelFolderId("bookmarks-bar") })

      const secondId = yield* folders.ensureRoot

      assert.strictEqual(secondId, firstId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "when the saved root has been removed, creates a new one and uses its ID from then on",
    () =>
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

  it.effect("when the saved ID is broken, looks the root up by title again", () =>
    Effect.gen(function* () {
      const existingId = yield* createFolder(yield* topLevelFolderId("other"), "Katip")
      yield* (yield* Storage).local.set("katip/pinned/root-folder-id", 42)

      const rootId = yield* (yield* SpaceFolders).ensureRoot

      assert.strictEqual(rootId, existingId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ensuring it concurrently still creates only one root", () =>
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

describe("ensuring a Space folder", () => {
  it.effect("creates a folder named after the Space directly inside the Katip root", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      const folderId = yield* folders.ensureSpaceFolder(space("work", "Work"))

      const folder = yield* (yield* Bookmarks).get(folderId)
      assert.strictEqual(folder.title, "Work")
      assert.deepStrictEqual(folder.parentId, Option.some(yield* folders.ensureRoot))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("uses the same folder from the second time on", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const firstId = yield* folders.ensureSpaceFolder(space("work"))

      const secondId = yield* folders.ensureSpaceFolder(space("work"))

      assert.strictEqual(secondId, firstId)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ensuring it concurrently still creates only one folder", () =>
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

  it.effect("recreates the folder when it was removed outside Katip", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const removedId = yield* folders.ensureSpaceFolder(space("work", "Work"))
      yield* (yield* Bookmarks).removeTree(removedId)

      const recreatedId = yield* folders.ensureSpaceFolder(space("work", "Work"))

      assert.notStrictEqual(recreatedId, removedId)
      assert.isTrue(yield* exists(recreatedId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "when the folder was moved out of Katip, recreates it directly inside the Katip root",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const movedId = yield* folders.ensureSpaceFolder(space("work", "Work"))
        yield* (yield* Bookmarks).move(movedId, {
          parentId: yield* topLevelFolderId("bookmarks-bar"),
        })

        const recreatedId = yield* folders.ensureSpaceFolder(space("work", "Work"))

        assert.notStrictEqual(recreatedId, movedId)
        assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), ["Work"])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("renaming gives the folder the Space's new name", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work", "Work"))

      yield* folders.renameSpaceFolder(space("work", "Day job"))

      assert.strictEqual((yield* (yield* Bookmarks).get(folderId)).title, "Day job")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "removing the Space removes its folder with everything in it, and ensuring it again gives a new folder",
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

  it.effect("removing the Space leaves a folder that was moved out of Katip in place", () =>
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

describe("reconciling Spaces with folders", () => {
  it.effect("renaming the folder in the bookmark manager renames the Space to match", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const folderId = yield* folders.ensureSpaceFolder(space("work", "Work"))
      yield* (yield* Bookmarks).update(folderId, { title: "Day job" })

      const spaces = yield* folders.reconcileSpaces([space("work", "Work")], numbered)

      assert.deepStrictEqual(
        spaces.map((s) => s.name),
        ["Day job"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "a folder added directly inside the Katip root becomes a new Space, and that folder becomes the Space's folder",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const addedId = yield* createFolder(yield* folders.ensureRoot, "Reading")

        const spaces = yield* folders.reconcileSpaces([], numbered)

        assert.deepStrictEqual(
          spaces.map((s) => s.name),
          ["Reading"],
        )
        const [discovered] = spaces
        assert.isDefined(discovered)
        assert.strictEqual(yield* folders.ensureSpaceFolder(discovered), addedId)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "a Space made from a folder with no name gets the default name, and so does the folder",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const addedId = yield* createFolder(yield* folders.ensureRoot, "")

        const spaces = yield* folders.reconcileSpaces([], numbered)

        const [discovered] = spaces
        assert.isDefined(discovered)
        assert.deepStrictEqual(
          [discovered.name, (yield* (yield* Bookmarks).get(addedId)).title],
          ["Space 1", "Space 1"],
        )
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Space whose folder is gone gets a new folder named after the Space", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const removedId = yield* folders.ensureSpaceFolder(space("work", "Work"))
      yield* (yield* Bookmarks).removeTree(removedId)

      const spaces = yield* folders.reconcileSpaces([space("work", "Work")], numbered)

      assert.deepStrictEqual(
        spaces.map((s) => s.name),
        ["Work"],
      )
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), ["Work"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("when the whole Katip root was removed, recreates it and every Space's folder", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureSpaceFolder(space("a", "Work"))
      yield* (yield* Bookmarks).removeTree(yield* folders.ensureRoot)

      yield* folders.reconcileSpaces([space("a", "Work"), space("b", "Hobbies")], numbered)

      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), [
        "Work",
        "Hobbies",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "even with the map lost, relinks the folder with the same name and keeps its pins",
    () =>
      Effect.gen(function* () {
        const folders = yield* SpaceFolders
        const folderId = yield* folders.ensureSpaceFolder(space("work", "Work"))
        yield* (yield* Storage).local.remove("katip/pinned/space-folders")

        yield* folders.reconcileSpaces([space("work", "Work")], numbered)

        assert.strictEqual(yield* folders.ensureSpaceFolder(space("work", "Work")), folderId)
        assert.lengthOf(yield* childrenOf(yield* folders.ensureRoot), 1)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("reconciling again right after leaves both the Spaces and the folders unchanged", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* createFolder(yield* folders.ensureRoot, "Reading")
      const once = yield* folders.reconcileSpaces([space("work", "Work")], numbered)

      const twice = yield* folders.reconcileSpaces(once, numbered)

      assert.deepStrictEqual(twice, once)
      assert.deepStrictEqual(titlesOf(yield* childrenOf(yield* folders.ensureRoot)), [
        "Reading",
        "Work",
      ])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("telling whether a node is within Katip", () => {
  it.effect("a bookmark deep inside a Space folder is within Katip", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      const spaceFolderId = yield* folders.ensureSpaceFolder(space("work"))
      const nestedId = yield* createFolder(yield* createFolder(spaceFolderId, "f1"), "f2")
      const pinId = yield* createBookmark(nestedId, "pin")

      assert.isTrue(yield* folders.isWithinKatip(pinId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("the Katip root itself is within Katip", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders

      assert.isTrue(yield* folders.isWithinKatip(yield* folders.ensureRoot))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a bookmark outside Katip isn't within Katip", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureRoot
      const outsideId = yield* createBookmark(yield* topLevelFolderId("bookmarks-bar"), "outside")

      assert.isFalse(yield* folders.isWithinKatip(outsideId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("before the root is ensured, no bookmark is within Katip", () =>
    Effect.gen(function* () {
      const katipLookalikeId = yield* createFolder(yield* topLevelFolderId("other"), "Katip")

      assert.isFalse(yield* (yield* SpaceFolders).isWithinKatip(katipLookalikeId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("an ID that doesn't exist isn't within Katip", () =>
    Effect.gen(function* () {
      const folders = yield* SpaceFolders
      yield* folders.ensureRoot

      assert.isFalse(yield* folders.isWithinKatip(BookmarkId.make("missing")))
    }).pipe(Effect.provide(TestLayer)),
  )
})
