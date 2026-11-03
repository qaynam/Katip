import { Effect, Option } from "effect"
import { Bookmarks } from "#platform/browser"
import type { ContractSuite } from "./scenario"
import { bookmarkUrl } from "./stage"

const placeOf = (node: { readonly index: Option.Option<number> }) => Option.getOrNull(node.index)

export const bookmarkSuite: ContractSuite = {
  name: "bookmarks",
  scenarios: [
    {
      name: "a new profile has only the bookmarks bar and other bookmarks folders",
      run: () =>
        Effect.gen(function* () {
          const root = yield* Bookmarks.use((bookmarks) => bookmarks.getTree)

          return {
            folders: Option.getOrElse(root.children, () => []).map((node) =>
              node._tag === "BookmarkFolder" ? Option.getOrElse(node.folderType, () => "") : "",
            ),
          }
        }),
      expected: { folders: ["bookmarks-bar", "other"] },
    },
    {
      name: "creating without a parent appends to other bookmarks",
      run: () =>
        Effect.gen(function* () {
          const bookmarks = yield* Bookmarks
          const created = yield* bookmarks.create({ title: "loose", url: bookmarkUrl("loose") })
          yield* Effect.addFinalizer(() => Effect.ignore(bookmarks.remove(created.id)))
          const parent = yield* bookmarks.get(Option.getOrThrow(created.parentId))
          const siblings = yield* bookmarks.getChildren(parent.id)

          return {
            parent: parent._tag === "BookmarkFolder" ? Option.getOrNull(parent.folderType) : null,
            last: siblings.at(-1)?.id === created.id,
          }
        }),
      expected: { parent: "other", last: true },
    },
    {
      name: "creating at an index inserts before the child at that index",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId } = yield* stage.openBookmarks(["a", "b", "c"])

          const created = yield* Bookmarks.use((bookmarks) =>
            bookmarks.create({ parentId: rootId, index: 1, title: "n", url: bookmarkUrl("n") }),
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => placeOf(created) })
        }),
      expected: {
        returned: 1,
        tree: ["a", "n", "b", "c"],
        bookmarkEvents: ["created n in root@1"],
      },
    },
    {
      name: "creating at an index beyond the children fails without creating",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId } = yield* stage.openBookmarks(["a"])

          const outcome = yield* stage.attempt(
            Bookmarks.use((bookmarks) =>
              bookmarks.create({ parentId: rootId, index: 5, title: "n", url: bookmarkUrl("n") }),
            ),
            stage.bookmark,
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => outcome })
        }),
      expected: { returned: "failed", tree: ["a"] },
    },
    {
      name: "creating with an empty URL makes a folder",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId } = yield* stage.openBookmarks([])

          yield* Bookmarks.use((bookmarks) =>
            bookmarks.create({ parentId: rootId, title: "empty", url: "" }),
          )

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["empty[]"], bookmarkEvents: ["created empty[?] in root@0"] },
    },
    {
      name: "moving backward within a folder lands one before the given index",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c", "d"])

          const moved = yield* Bookmarks.use((bookmarks) =>
            bookmarks.move(id("a"), { parentId: rootId, index: 2 }),
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => placeOf(moved) })
        }),
      expected: {
        returned: 1,
        tree: ["b", "a", "c", "d"],
        bookmarkEvents: ["moved a root@0→root@1"],
      },
    },
    {
      name: "moving forward within a folder lands at the given index",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c", "d"])

          yield* Bookmarks.use((bookmarks) => bookmarks.move(id("d"), { index: 1 }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a", "d", "b", "c"], bookmarkEvents: ["moved d root@3→root@1"] },
    },
    {
      name: "moving to the current index or the one after it changes and emits nothing",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c"])

          yield* Bookmarks.use((bookmarks) =>
            Effect.andThen(
              bookmarks.move(id("b"), { index: 1 }),
              bookmarks.move(id("b"), { index: 2 }),
            ),
          )

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a", "b", "c"] },
    },
    {
      name: "moving without an index goes to the end, even within the same folder",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c"])

          yield* Bookmarks.use((bookmarks) => bookmarks.move(id("a"), { parentId: rootId }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["b", "c", "a"], bookmarkEvents: ["moved a root@0→root@2"] },
    },
    {
      name: "moving into another folder lands at the given index there",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks([
            "a",
            { folder: "F", children: ["x", "y"] },
          ])

          yield* Bookmarks.use((bookmarks) =>
            bookmarks.move(id("a"), { parentId: id("F"), index: 1 }),
          )

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["F[x a y]"], bookmarkEvents: ["moved a root@0→F@1"] },
    },
    {
      name: "a folder cannot be moved into itself",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks([
            { folder: "F", children: [{ folder: "G", children: [] }] },
          ])

          const outcome = yield* stage.attempt(
            Bookmarks.use((bookmarks) => bookmarks.move(id("F"), { parentId: id("G") })),
            stage.bookmark,
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => outcome })
        }),
      expected: { returned: "failed", tree: ["F[G[]]"] },
    },
    {
      name: "moving to an index beyond the children fails without moving",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b"])

          const outcome = yield* stage.attempt(
            Bookmarks.use((bookmarks) => bookmarks.move(id("a"), { index: 5 })),
            stage.bookmark,
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => outcome })
        }),
      expected: { returned: "failed", tree: ["a", "b"] },
    },
    {
      name: "changing title and URL together emits one change for the title, then one for the URL",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a"])

          yield* Bookmarks.use((bookmarks) =>
            bookmarks.update(id("a"), { title: "renamed", url: bookmarkUrl("moved") }),
          )

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: {
        tree: ["a"],
        bookmarkEvents: [
          `changed a title=renamed url=${bookmarkUrl("a")}`,
          `changed a title=renamed url=${bookmarkUrl("moved")}`,
        ],
      },
    },
    {
      name: "setting the same title emits no change",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a"])

          yield* Bookmarks.use((bookmarks) => bookmarks.update(id("a"), { title: "a" }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a"] },
    },
    {
      name: "setting a URL on a folder fails without changing it",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks([{ folder: "F", children: [] }])

          const outcome = yield* stage.attempt(
            Bookmarks.use((bookmarks) => bookmarks.update(id("F"), { url: bookmarkUrl("F") })),
            stage.bookmark,
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => outcome })
        }),
      expected: { returned: "failed", tree: ["F[]"] },
    },
    {
      name: "remove cannot delete a non-empty folder",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks([{ folder: "F", children: ["x"] }])

          const outcome = yield* stage.attempt(
            Bookmarks.use((bookmarks) => bookmarks.remove(id("F"))),
            () => "removed",
          )

          return yield* stage.observe({ bookmarks: rootId, returned: () => outcome })
        }),
      expected: { returned: "failed", tree: ["F[x]"] },
    },
    {
      name: "removeTree deletes a folder with its contents and emits a single removal",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks([
            "a",
            { folder: "F", children: ["x", { folder: "G", children: ["y"] }] },
          ])

          yield* Bookmarks.use((bookmarks) => bookmarks.removeTree(id("F")))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a"], bookmarkEvents: ["removed F[x G[y]] from root@1"] },
    },
    {
      name: "folders read with getChildren do not have their children loaded",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId } = yield* stage.openBookmarks(["a", { folder: "F", children: ["x"] }])

          const children = yield* Bookmarks.use((bookmarks) => bookmarks.getChildren(rootId))

          return { children: children.map(stage.bookmark) }
        }),
      expected: { children: ["a", "F[?]"] },
    },
    {
      name: "getSubTree returns all descendants loaded",
      run: (stage) =>
        Effect.gen(function* () {
          const { id } = yield* stage.openBookmarks([
            { folder: "F", children: ["x", { folder: "G", children: ["y"] }] },
          ])

          const folder = yield* Bookmarks.use((bookmarks) => bookmarks.getSubTree(id("F")))

          return { folder: stage.bookmark(folder) }
        }),
      expected: { folder: "F[x G[y]]" },
    },
  ],
}
