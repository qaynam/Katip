import { Effect, Option } from "effect"
import { Bookmarks } from "#platform/browser"
import type { ContractSuite } from "./scenario"
import { bookmarkUrl } from "./stage"

const placeOf = (node: { readonly index: Option.Option<number> }) => Option.getOrNull(node.index)

export const bookmarkSuite: ContractSuite = {
  name: "bookmarks",
  scenarios: [
    {
      name: "最初からあるのは、ブックマークバーとその他のブックマークのフォルダだけ",
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
      name: "親を指定せずに作ると、その他のブックマークの末尾に作る",
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
      name: "index を指定して作ると、その位置にあった子の前に入る",
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
      name: "子の数を超える index で作ろうとすると、作らずに失敗する",
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
      name: "空の URL で作ると、フォルダができる",
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
      name: "同じフォルダの中で後ろへ動かすと、指定した index の 1 つ手前に入る",
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
      name: "同じフォルダの中で前へ動かすと、指定した index に入る",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c", "d"])

          yield* Bookmarks.use((bookmarks) => bookmarks.move(id("d"), { index: 1 }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a", "d", "b", "c"], bookmarkEvents: ["moved d root@3→root@1"] },
    },
    {
      name: "今の位置かそのすぐ後ろを指定して動かしても、何も変わらず何も届かない",
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
      name: "index を省略して動かすと、同じフォルダの中でも末尾へ動く",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a", "b", "c"])

          yield* Bookmarks.use((bookmarks) => bookmarks.move(id("a"), { parentId: rootId }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["b", "c", "a"], bookmarkEvents: ["moved a root@0→root@2"] },
    },
    {
      name: "別のフォルダへ動かすと、そのフォルダの指定した index に入る",
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
      name: "フォルダを自分の中へは動かせない",
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
      name: "子の数を超える index へ動かそうとすると、動かさずに失敗する",
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
      name: "タイトルと URL を一緒に変えると、タイトル、URL の順に 1 回ずつ変化が届く",
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
      name: "今と同じタイトルに変えても、変化は届かない",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId, id } = yield* stage.openBookmarks(["a"])

          yield* Bookmarks.use((bookmarks) => bookmarks.update(id("a"), { title: "a" }))

          return yield* stage.observe({ bookmarks: rootId })
        }),
      expected: { tree: ["a"] },
    },
    {
      name: "フォルダに URL を設定しようとすると、変えずに失敗する",
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
      name: "中身のあるフォルダは remove では消せない",
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
      name: "removeTree でフォルダを消すと、中身ごと消えたことが 1 回だけ届く",
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
      name: "getChildren で読んだ子のフォルダは、その子を読み込んでいない",
      run: (stage) =>
        Effect.gen(function* () {
          const { rootId } = yield* stage.openBookmarks(["a", { folder: "F", children: ["x"] }])

          const children = yield* Bookmarks.use((bookmarks) => bookmarks.getChildren(rootId))

          return { children: children.map(stage.bookmark) }
        }),
      expected: { children: ["a", "F[?]"] },
    },
    {
      name: "getSubTree は子孫まで読み込んで返す",
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
