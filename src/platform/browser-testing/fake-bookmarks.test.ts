import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { BookmarkId, type BookmarkNode, Bookmarks, type BrowserEvent } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const bookmarksBar = BookmarkId.make("1")
const otherBookmarks = BookmarkId.make("2")
const missingNode = BookmarkId.make("9999")

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

const childIdsOf = (folderId: BookmarkId) =>
  Bookmarks.use((bookmarks) => bookmarks.getChildren(folderId)).pipe(
    Effect.map((children) => children.map(({ id }) => id)),
  )

const childrenOf = (node: BookmarkNode) =>
  node._tag === "BookmarkFolder" ? node.children : Option.none()

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Bookmarks", (it) => {
  describe("the initial state", () => {
    it.effect("the root holds only the bookmarks bar and other bookmarks, like a new profile", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const root = yield* bookmarks.getTree

        assert.deepStrictEqual(
          Option.map(root.children, (children) =>
            children.map((child) =>
              child._tag === "BookmarkFolder" ? child.folderType : Option.none(),
            ),
          ),
          Option.some([Option.some("bookmarks-bar"), Option.some("other")]),
        )
      }),
    )
  })

  describe("creating a node", () => {
    it.effect("without a parent, appends it to Other bookmarks and emits BookmarkCreated", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        yield* fake.seedBookmarks(otherBookmarks, [
          { title: "Existing", url: "https://a.example/" },
        ])

        const created = yield* bookmarks.create({ title: "New", url: "https://b.example/" })

        assert.deepStrictEqual(
          [created.parentId, created.index],
          [Option.some(otherBookmarks), Option.some(1)],
        )
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "BookmarkCreated", node: created },
        ])
      }),
    )

    it.effect("without a URL, creates a folder", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const created = yield* bookmarks.create({ parentId: bookmarksBar, title: "Folder" })

        assert.strictEqual(created._tag, "BookmarkFolder")
      }),
    )

    it.effect("with an index, inserts it there and shifts the nodes after it", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [first, second] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
          { title: "b", url: "https://b.example/" },
        ])

        const created = yield* bookmarks.create({
          parentId: bookmarksBar,
          index: 1,
          title: "new",
          url: "https://new.example/",
        })

        assert.deepStrictEqual(yield* childIdsOf(bookmarksBar), [first.id, created.id, second.id])
      }),
    )

    it.effect("fails with an index beyond the number of children", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(
          bookmarks.create({ parentId: bookmarksBar, index: 1, title: "x" }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("cannot create directly under the root", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(
          bookmarks.create({ parentId: BookmarkId.make("0"), title: "x" }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("fails with a string that does not parse as a URL", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.create({ title: "x", url: "not a url" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("updating a node", () => {
    it.effect("changing both the title and the URL emits a BookmarkChanged for each", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [node] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "before", url: "https://before.example/" },
        ])
        const id = node.id

        yield* bookmarks.update(id, { title: "after", url: "https://after.example/" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          {
            _tag: "BookmarkChanged",
            id,
            title: "after",
            url: Option.some("https://before.example/"),
          },
          {
            _tag: "BookmarkChanged",
            id,
            title: "after",
            url: Option.some("https://after.example/"),
          },
        ])
      }),
    )

    it.effect("emits nothing when no value changes", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [node] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "same", url: "https://same.example/" },
        ])

        yield* bookmarks.update(node.id, { title: "same" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("fails when setting a URL on a folder", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [folder] = yield* fake.seedBookmarks(bookmarksBar, [{ title: "f", children: [] }])

        const error = yield* Effect.flip(bookmarks.update(folder.id, { url: "https://x.example/" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("cannot change a permanent folder", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.update(bookmarksBar, { title: "x" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("moving a node", () => {
    it.effect("moving it later within its folder leaves it one less than the given index", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [a, b, c] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
          { title: "b", url: "https://b.example/" },
          { title: "c", url: "https://c.example/" },
        ])
        const id = a.id

        const moved = yield* bookmarks.move(id, { index: 2 })

        assert.deepStrictEqual(moved.index, Option.some(1))
        assert.deepStrictEqual(yield* childIdsOf(bookmarksBar), [b.id, a.id, c.id])
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          {
            _tag: "BookmarkMoved",
            id,
            parentId: bookmarksBar,
            index: 1,
            oldParentId: bookmarksBar,
            oldIndex: 0,
          },
        ])
      }),
    )

    it.effect("an index at its current position or right after it does nothing", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [a] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
          { title: "b", url: "https://b.example/" },
        ])

        yield* bookmarks.move(a.id, { index: 1 })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("moving it to another folder puts the old parent and index in BookmarkMoved", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [node] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
        ])
        const id = node.id

        yield* bookmarks.move(id, { parentId: otherBookmarks })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          {
            _tag: "BookmarkMoved",
            id,
            parentId: otherBookmarks,
            index: 0,
            oldParentId: bookmarksBar,
            oldIndex: 0,
          },
        ])
      }),
    )

    it.effect("cannot move a folder into its own descendants", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [outer] = yield* fake.seedBookmarks(bookmarksBar, [{ title: "outer", children: [] }])
        const [inner] = yield* fake.seedBookmarks(outer.id, [{ title: "inner", children: [] }])

        const error = yield* Effect.flip(bookmarks.move(outer.id, { parentId: inner.id }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("removing a node", () => {
    it.effect("remove cannot remove a non-empty folder", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [folder] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "f", children: [{ title: "a", url: "https://a.example/" }] },
        ])

        const error = yield* Effect.flip(bookmarks.remove(folder.id))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect(
      "removeTree deletes the contents too and emits a single BookmarkRemoved whose node has children but no parent or index",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const bookmarks = yield* Bookmarks
          const [folder] = yield* fake.seedBookmarks(bookmarksBar, [
            { title: "f", children: [{ title: "a", url: "https://a.example/" }] },
          ])

          yield* bookmarks.removeTree(folder.id)

          const events = yield* fake.takeEmittedEvents
          assert.deepStrictEqual(tagsOf(events), ["BookmarkRemoved"])
          assert.deepStrictEqual(
            events.map((event) => (event._tag === "BookmarkRemoved" ? event.node : event)),
            [{ ...folder, parentId: Option.none(), index: Option.none() }],
          )
          assert.deepStrictEqual(yield* childIdsOf(bookmarksBar), [])
        }),
    )

    it.effect("shifts the nodes after the removed one back", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [a, b] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
          { title: "b", url: "https://b.example/" },
        ])

        yield* bookmarks.remove(a.id)

        assert.deepStrictEqual((yield* bookmarks.get(b.id)).index, Option.some(0))
      }),
    )
  })

  describe("reading nodes", () => {
    it.effect("getChildren does not load the children's children", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        yield* fake.seedBookmarks(bookmarksBar, [{ title: "f", children: [] }])

        const [child] = yield* bookmarks.getChildren(bookmarksBar)

        assert.deepStrictEqual(
          Option.map(Option.fromUndefinedOr(child), childrenOf),
          Option.some(Option.none()),
        )
      }),
    )

    it.effect("getSubTree loads every descendant", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [folder] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "f", children: [{ title: "g", children: [] }] },
        ])

        const subTree = yield* bookmarks.getSubTree(folder.id)

        assert.deepStrictEqual(subTree, folder)
      }),
    )

    it.effect("fails for a node that does not exist", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.get(missingNode))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("searching nodes", () => {
    it.effect("matches nodes whose title contains every word", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [match] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "Effect Schema Guide", url: "https://a.example/" },
          { title: "Effect only", url: "https://b.example/" },
        ])

        const found = yield* bookmarks.search("schema effect")

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [match.id],
        )
      }),
    )

    it.effect("with a url, returns only bookmarks matching it exactly", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [match] = yield* fake.seedBookmarks(bookmarksBar, [
          { title: "a", url: "https://a.example/" },
          { title: "a2", url: "https://a.example/page" },
        ])

        const found = yield* bookmarks.search({ url: "https://a.example/" })

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [match.id],
        )
      }),
    )

    it.effect("leaves permanent folders out of the results", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const found = yield* bookmarks.search("bookmarks")

        assert.deepStrictEqual(found, [])
      }),
    )
  })

  describe("seeding bookmarks", () => {
    it.effect("fires no events", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        yield* fake.seedBookmarks(bookmarksBar, [{ title: "a", url: "https://a.example/" }])

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )
  })
})
