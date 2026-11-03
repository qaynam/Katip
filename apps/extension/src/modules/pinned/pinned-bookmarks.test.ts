import { assert, describe, it } from "@effect/vitest"
import { Array, Effect, Layer, Option } from "effect"
import type { LiveSource } from "#modules/live-folders"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, Bookmarks, type BookmarkFolderType } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { isFolderExpanded } from "./folder-expansion"
import { FolderExpansionStore } from "./folder-expansion-store"
import { FolderIconStore } from "./folder-icon-store"
import { FolderDepthExceeded } from "./pinned-errors"
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

const work = space("work", "Work")
const hobby = space("hobby", "Hobbies")

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
    return yield* Effect.fromOption(folder, () => new Error(`no ${folderType} folder`))
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

describe("loading pinned trees", () => {
  it.effect("loads the Space folder's contents, keeping the folder nesting and order", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")
      const folderId = yield* addFolder(spaceFolderId, "Notes")
      yield* addPin(folderId, "b")
      yield* addPin(spaceFolderId, "c")

      const tree = yield* (yield* PinnedBookmarks).loadSpaceTree(work.id)

      assert.deepStrictEqual(outline(tree), ["a", { Notes: ["b"] }, "c"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Space with no folder yet counts as unreadable, not empty", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* PinnedBookmarks).loadSpaceTree(work.id))

      assert.strictEqual(error._tag, "PinnedTreeUnavailable")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can't load a Space whose folder was removed outside Katip", () =>
    Effect.gen(function* () {
      yield* (yield* Bookmarks).removeTree(yield* spaceFolderOf(work))

      const error = yield* Effect.flip((yield* PinnedBookmarks).loadSpaceTree(work.id))

      assert.strictEqual(error._tag, "PinnedTreeUnavailable")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("loading every Space at once returns only the trees of Spaces that have a folder", () =>
    Effect.gen(function* () {
      yield* addPin(yield* spaceFolderOf(work), "a")
      yield* spaceFolderOf(hobby)
      yield* (yield* Bookmarks).removeTree(yield* spaceFolderOf(hobby))

      const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees

      assert.deepStrictEqual([...trees.keys()], [work.id])
      assert.deepStrictEqual(outline(trees.get(work.id) ?? []), ["a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("when the whole Katip root was removed, loading every Space returns nothing", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      yield* (yield* Bookmarks).removeTree(yield* (yield* SpaceFolders).ensureRoot)

      const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees

      assert.strictEqual(trees.size, 0)
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("locating a node", () => {
  it.effect("tells the Space, the folder and the position within the folder", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "Notes")
      yield* addPin(folderId, "a")
      const pinId = yield* addPin(folderId, "b")

      const location = yield* (yield* PinnedBookmarks).locate(pinId)

      assert.strictEqual(location.spaceId, work.id)
      assert.deepStrictEqual(location.parentFolderId, Option.some(folderId))
      assert.strictEqual(location.depth, 2)
      assert.strictEqual(location.index, 1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a bookmark outside Katip isn't found", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      const outsideId = yield* addPin(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip((yield* PinnedBookmarks).locate(outsideId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Space folder itself isn't found as a pinned node", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)

      const error = yield* Effect.flip((yield* PinnedBookmarks).locate(spaceFolderId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("creating a bookmark", () => {
  it.effect("without an index, creates it at the end directly inside the Space", () =>
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

  it.effect("with an index, creates it at that index", () =>
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

  it.effect("can create it inside a folder", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "Notes")

      yield* (yield* PinnedBookmarks).createBookmark(
        { parent: inFolder(folderId) },
        { title: "new", url: "https://example.com/new" },
      )

      assert.deepStrictEqual(yield* titlesIn(folderId), ["new"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "when the Space's folder was removed outside Katip, recreates it and creates it there",
    () =>
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

  it.effect("can't create one inside a folder outside Katip", () =>
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

describe("creating a folder", () => {
  it.effect("the created folder is saved as expanded", () =>
    Effect.gen(function* () {
      const folderId = yield* (yield* PinnedBookmarks).createFolder(
        { parent: spaceRoot(work) },
        { title: "Notes" },
        syncOff,
      )

      assert.isTrue(isFolderExpanded(yield* (yield* FolderExpansionStore).load, folderId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can create a folder inside a folder at depth 1", () =>
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

  it.effect("can't create a folder inside a folder at depth 2", () =>
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

  it.effect("with tab group sync on, can't create a folder inside a folder at depth 1", () =>
    Effect.gen(function* () {
      const depth1 = yield* addFolder(yield* spaceFolderOf(work), "1")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createFolder({ parent: inFolder(depth1) }, { title: "2" }, syncOn),
      )

      assert.strictEqual(error._tag, "FolderDepthExceeded")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can't create a folder inside a bookmark", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).createFolder({ parent: inFolder(pinId) }, { title: "x" }, syncOff),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("moving a bookmark", () => {
  it.effect("moved later within the same parent, it lands at the given index", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const a = yield* addPin(spaceFolderId, "a")
      yield* addPin(spaceFolderId, "b")
      yield* addPin(spaceFolderId, "c")

      yield* (yield* PinnedBookmarks).moveNode(a, { parent: spaceRoot(work), index: 2 }, syncOff)

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["b", "c", "a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("moved earlier within the same parent, it lands at the given index", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      yield* addPin(spaceFolderId, "a")
      yield* addPin(spaceFolderId, "b")
      const c = yield* addPin(spaceFolderId, "c")

      yield* (yield* PinnedBookmarks).moveNode(c, { parent: spaceRoot(work), index: 0 }, syncOff)

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["c", "a", "b"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be moved into another Space's folder at a given index", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")
      const hobbyFolderId = yield* addFolder(yield* spaceFolderOf(hobby), "Notes")
      yield* addPin(hobbyFolderId, "x")

      yield* (yield* PinnedBookmarks).moveNode(
        pinId,
        { parent: inFolder(hobbyFolderId), index: 0 },
        syncOff,
      )

      assert.deepStrictEqual(yield* titlesIn(hobbyFolderId), ["a", "x"])
      assert.strictEqual((yield* (yield* PinnedBookmarks).locate(pinId)).spaceId, hobby.id)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("without an index, it lands at the end of the destination", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const folderId = yield* addFolder(spaceFolderId, "Notes")
      const pinId = yield* addPin(spaceFolderId, "a")
      yield* addPin(folderId, "x")

      yield* (yield* PinnedBookmarks).moveNode(pinId, { parent: inFolder(folderId) }, syncOff)

      assert.deepStrictEqual(yield* titlesIn(folderId), ["x", "a"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("moving a bookmark outside Katip is refused", () =>
    Effect.gen(function* () {
      const barId = yield* outsideFolderId("bookmarks-bar")
      const outsideId = yield* addPin(barId, "outside")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveNode(outsideId, { parent: spaceRoot(work) }, syncOff),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.deepStrictEqual(yield* titlesIn(barId), ["outside"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can't be moved into a folder outside Katip", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")
      const outsideId = yield* addFolder(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveNode(pinId, { parent: inFolder(outsideId) }, syncOff),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.deepStrictEqual(yield* titlesIn(outsideId), [])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("moving a folder", () => {
  it.effect("moves a folder into another folder with everything in it", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const moving = yield* addFolder(spaceFolderId, "Notes")
      yield* addPin(moving, "x")
      const target = yield* addFolder(spaceFolderId, "Projects")

      yield* (yield* PinnedBookmarks).moveNode(moving, { parent: inFolder(target) }, syncOff)

      const location = yield* (yield* PinnedBookmarks).locate(moving)
      assert.deepStrictEqual(
        [yield* titlesIn(target), yield* titlesIn(moving), location.depth],
        [["Notes"], ["x"], 2],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a folder moved later within the same parent lands at the given index too", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const folderId = yield* addFolder(spaceFolderId, "f1")
      yield* addPin(spaceFolderId, "p")
      yield* addFolder(spaceFolderId, "f2")

      yield* (yield* PinnedBookmarks).moveNode(
        folderId,
        { parent: spaceRoot(work), index: 2 },
        syncOff,
      )

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["p", "f2", "f1"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("moved to another Space, it and its contents become that Space's pins", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "Notes")
      const pinId = yield* addPin(folderId, "x")

      yield* (yield* PinnedBookmarks).moveNode(folderId, { parent: spaceRoot(hobby) }, syncOff)

      const pinned = yield* PinnedBookmarks
      assert.deepStrictEqual(
        [(yield* pinned.locate(folderId)).spaceId, (yield* pinned.locate(pinId)).spaceId],
        [hobby.id, hobby.id],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a folder with folders inside can't be moved to where it would be past the limit", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const outer = yield* addFolder(spaceFolderId, "Outer")
      yield* addFolder(outer, "Inner")
      const target = yield* addFolder(spaceFolderId, "Projects")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveNode(outer, { parent: inFolder(target) }, syncOff),
      )

      assert.deepStrictEqual(
        [error, yield* titlesIn(target)],
        [new FolderDepthExceeded({ depth: 3, maxDepth: 2 }), []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "split pins and live folders inside don't count as depth, so it can go down to the limit",
    () =>
      Effect.gen(function* () {
        const pinned = yield* PinnedBookmarks
        const outer = yield* pinned.createFolder(
          { parent: spaceRoot(work) },
          { title: "Outer" },
          syncOff,
        )
        yield* pinned.createSplit(
          { parent: inFolder(outer) },
          {
            title: "Mail | Calendar",
            left: { title: "Mail", url: "https://mail.example/" },
            right: { title: "Calendar", url: "https://calendar.example/" },
          },
        )
        yield* pinned.createLiveFolder(
          { parent: inFolder(outer) },
          { title: "Review requests", source: { _tag: "GitHub", query: "review-requested" } },
        )
        const target = yield* pinned.createFolder(
          { parent: spaceRoot(work) },
          { title: "Projects" },
          syncOff,
        )

        yield* pinned.moveNode(outer, { parent: inFolder(target) }, syncOff)

        assert.strictEqual((yield* pinned.locate(outer)).depth, 2)
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("with tab group sync on, a folder can't be moved into a folder", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const moving = yield* addFolder(spaceFolderId, "Notes")
      const target = yield* addFolder(spaceFolderId, "Projects")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).moveNode(moving, { parent: inFolder(target) }, syncOn),
      )

      assert.deepStrictEqual(error, new FolderDepthExceeded({ depth: 2, maxDepth: 1 }))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a folder already deeper than the limit can still be reordered at the same depth", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const outer = yield* addFolder(spaceFolderId, "Outer")
      yield* addFolder(outer, "Inner")
      yield* addPin(spaceFolderId, "p")

      yield* (yield* PinnedBookmarks).moveNode(outer, { parent: spaceRoot(work), index: 1 }, syncOn)

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["p", "Outer"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a folder can't be moved into itself or a folder inside it", () =>
    Effect.gen(function* () {
      const outer = yield* addFolder(yield* spaceFolderOf(work), "Outer")
      const inner = yield* addFolder(outer, "Inner")
      const pinned = yield* PinnedBookmarks

      const errors = [
        yield* Effect.flip(pinned.moveNode(outer, { parent: inFolder(inner) }, syncOff)),
        yield* Effect.flip(pinned.moveNode(outer, { parent: inFolder(outer) }, syncOff)),
      ]

      assert.deepStrictEqual(
        errors.map((error) => error._tag),
        ["MoveIntoDescendant", "MoveIntoDescendant"],
      )
      assert.deepStrictEqual(yield* titlesIn(inner), [])
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("renaming and updating", () => {
  it.effect("renames bookmarks and folders alike", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)
      const pinId = yield* addPin(spaceFolderId, "a")
      const folderId = yield* addFolder(spaceFolderId, "f")
      const pinned = yield* PinnedBookmarks

      yield* pinned.rename(pinId, "Pin")
      yield* pinned.rename(folderId, "Folder")

      assert.deepStrictEqual(yield* titlesIn(spaceFolderId), ["Pin", "Folder"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a Space folder can't be renamed as a pin", () =>
    Effect.gen(function* () {
      const spaceFolderId = yield* spaceFolderOf(work)

      const error = yield* Effect.flip((yield* PinnedBookmarks).rename(spaceFolderId, "x"))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.strictEqual((yield* (yield* Bookmarks).get(spaceFolderId)).title, "Work")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("replaces a bookmark's URL and title", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      yield* (yield* PinnedBookmarks).updateBookmark(pinId, {
        title: "New page",
        url: "https://example.com/new",
      })

      const updated = yield* (yield* Bookmarks).get(pinId)
      assert.strictEqual(updated.title, "New page")
      assert.deepStrictEqual(updated._tag === "Bookmark" && updated.url, "https://example.com/new")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can't give a folder a URL", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "Notes")

      const error = yield* Effect.flip(
        (yield* PinnedBookmarks).updateBookmark(folderId, { title: "x", url: "https://x.test/" }),
      )

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("removing", () => {
  it.effect("removes a bookmark", () =>
    Effect.gen(function* () {
      const pinId = yield* addPin(yield* spaceFolderOf(work), "a")

      yield* (yield* PinnedBookmarks).removeBookmark(pinId)

      assert.isFalse(yield* exists(pinId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("removing a bookmark can't remove a folder", () =>
    Effect.gen(function* () {
      const folderId = yield* addFolder(yield* spaceFolderOf(work), "Notes")

      const error = yield* Effect.flip((yield* PinnedBookmarks).removeBookmark(folderId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.isTrue(yield* exists(folderId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can't remove a bookmark outside Katip", () =>
    Effect.gen(function* () {
      yield* spaceFolderOf(work)
      const outsideId = yield* addPin(yield* outsideFolderId("bookmarks-bar"), "outside")

      const error = yield* Effect.flip((yield* PinnedBookmarks).removeBookmark(outsideId))

      assert.strictEqual(error._tag, "PinnedNodeNotFound")
      assert.isTrue(yield* exists(outsideId))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect(
    "removes a folder with everything in it and drops the expansion state of its folders",
    () =>
      Effect.gen(function* () {
        const pinned = yield* PinnedBookmarks
        const store = yield* FolderExpansionStore
        const outer = yield* pinned.createFolder(
          { parent: spaceRoot(work) },
          { title: "1" },
          syncOff,
        )
        const inner = yield* pinned.createFolder(
          { parent: inFolder(outer) },
          { title: "2" },
          syncOff,
        )
        const pinId = yield* addPin(inner, "a")

        yield* pinned.removeFolder(outer)

        assert.isFalse(yield* exists(outer))
        assert.isFalse(yield* exists(pinId))
        assert.deepStrictEqual(yield* store.load, {})
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("removing a folder drops the icons of it and the folders inside it", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const icons = yield* FolderIconStore
      const outer = yield* pinned.createFolder({ parent: spaceRoot(work) }, { title: "1" }, syncOff)
      const inner = yield* pinned.createFolder({ parent: inFolder(outer) }, { title: "2" }, syncOff)
      const other = yield* pinned.createFolder({ parent: spaceRoot(work) }, { title: "3" }, syncOff)
      yield* icons.setIcon(outer, "star")
      yield* icons.setIcon(inner, "moon")
      yield* icons.setIcon(other, "leaf")

      yield* pinned.removeFolder(outer)

      assert.deepStrictEqual(yield* icons.load, new Map([[other, "leaf"]]))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("split view pins", () => {
  const draft = {
    title: "Mail | Calendar",
    left: { title: "Mail", url: "https://mail.example/" },
    right: { title: "Calendar", url: "https://calendar.example/" },
  }

  it.effect(
    "is created as a split pin holding two bookmarks and loads as one pin in the tree",
    () =>
      Effect.gen(function* () {
        const pinned = yield* PinnedBookmarks

        yield* pinned.createSplit({ parent: spaceRoot(work) }, draft)
        const tree = yield* pinned.loadSpaceTree(work.id)

        assert.deepStrictEqual(
          tree.map((node) =>
            node._tag === "PinnedSplit" ? [node.title, node.items.map((item) => item.title)] : node,
          ),
          [["Mail | Calendar", ["Mail", "Calendar"]]],
        )
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be created inside a folder already at the depth limit", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder(
        { parent: spaceRoot(work) },
        { title: "Outer" },
        syncOn,
      )

      const created = yield* pinned.createSplit({ parent: inFolder(outer) }, draft)
      const location = yield* pinned.locate(created.folderId)

      assert.deepStrictEqual([location.node._tag, location.depth], ["PinnedSplit", 2])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be moved into another Space's folder", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const created = yield* pinned.createSplit({ parent: spaceRoot(work) }, draft)
      const folder = yield* pinned.createFolder(
        { parent: spaceRoot(hobby) },
        { title: "Travel" },
        syncOff,
      )

      yield* pinned.moveNode(created.folderId, { parent: inFolder(folder) }, syncOff)
      const location = yield* pinned.locate(created.folderId)

      assert.deepStrictEqual(
        [location.spaceId, location.parentFolderId, location.node._tag],
        [hobby.id, Option.some(folder), "PinnedSplit"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("removing it removes its two bookmarks too", () =>
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

describe("live folders", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const draft = { title: "Review requests", source: reviews }

  it.effect("is created as a live folder with its source and saved as expanded", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks

      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)
      const tree = yield* pinned.loadSpaceTree(work.id)

      assert.deepStrictEqual(
        [tree, isFolderExpanded(yield* (yield* FolderExpansionStore).load, folderId)],
        [
          [{ _tag: "PinnedLiveFolder", id: folderId, title: "Review requests", source: reviews }],
          true,
        ],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be created inside a folder already at the depth limit", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder(
        { parent: spaceRoot(work) },
        { title: "Outer" },
        syncOn,
      )

      const folderId = yield* pinned.createLiveFolder({ parent: inFolder(outer) }, draft)
      const location = yield* pinned.locate(folderId)

      assert.deepStrictEqual([location.node._tag, location.depth], ["PinnedLiveFolder", 2])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be moved into another Space's folder", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)
      const folder = yield* pinned.createFolder(
        { parent: spaceRoot(hobby) },
        { title: "Travel" },
        syncOff,
      )

      yield* pinned.moveNode(folderId, { parent: inFolder(folder) }, syncOff)
      const location = yield* pinned.locate(folderId)

      assert.deepStrictEqual(
        [location.spaceId, location.parentFolderId, location.node._tag],
        [hobby.id, Option.some(folder), "PinnedLiveFolder"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("can be renamed", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const folderId = yield* pinned.createLiveFolder({ parent: spaceRoot(work) }, draft)

      yield* pinned.rename(folderId, "PRs to review")

      assert.strictEqual((yield* pinned.locate(folderId)).node.title, "PRs to review")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("no bookmark can be created inside it", () =>
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

  it.effect("removing it removes the folder and drops its mark and expansion state", () =>
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

  it.effect("removing the folder it is in drops its mark and expansion state too", () =>
    Effect.gen(function* () {
      const pinned = yield* PinnedBookmarks
      const outer = yield* pinned.createFolder(
        { parent: spaceRoot(work) },
        { title: "Outer" },
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
