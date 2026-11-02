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

layer(FakeBrowser.layer, { buildPerTest: true })("Bookmarks の fake", (it) => {
  describe("最初の状態", () => {
    it.effect(
      "ルートの下には、新しいプロファイルと同じくブックマークバーとその他のブックマークだけがある",
      () =>
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

  describe("ノードを作ったとき", () => {
    it.effect("親を省略すると、その他のブックマークの末尾に作り BookmarkCreated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        yield* fake.seedBookmarks(otherBookmarks, [{ title: "既存", url: "https://a.example/" }])

        const created = yield* bookmarks.create({ title: "新規", url: "https://b.example/" })

        assert.deepStrictEqual(
          [created.parentId, created.index],
          [Option.some(otherBookmarks), Option.some(1)],
        )
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "BookmarkCreated", node: created },
        ])
      }),
    )

    it.effect("URL を省略するとフォルダを作る", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const created = yield* bookmarks.create({ parentId: bookmarksBar, title: "フォルダ" })

        assert.strictEqual(created._tag, "BookmarkFolder")
      }),
    )

    it.effect("index を指定するとその位置に入り、後ろのノードの位置がずれる", () =>
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

    it.effect("子の数より大きい index は失敗する", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(
          bookmarks.create({ parentId: bookmarksBar, index: 1, title: "x" }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("ルートの直下には作れない", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(
          bookmarks.create({ parentId: BookmarkId.make("0"), title: "x" }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("URL として読めない文字列は失敗する", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.create({ title: "x", url: "not a url" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("ノードを更新したとき", () => {
    it.effect("タイトルと URL を両方変えると、それぞれの BookmarkChanged が発火する", () =>
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

    it.effect("値が変わらなければ発火しない", () =>
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

    it.effect("フォルダに URL を設定すると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const bookmarks = yield* Bookmarks
        const [folder] = yield* fake.seedBookmarks(bookmarksBar, [{ title: "f", children: [] }])

        const error = yield* Effect.flip(bookmarks.update(folder.id, { url: "https://x.example/" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("固定のフォルダは変えられない", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.update(bookmarksBar, { title: "x" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("ノードを動かしたとき", () => {
    it.effect("同じフォルダの中で後ろへ動かすと、移動後の位置は指定より 1 小さい", () =>
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

    it.effect("今の位置かその直後を指すと、何も起きない", () =>
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

    it.effect("別のフォルダへ動かすと、移動前の親と位置が BookmarkMoved に入る", () =>
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

    it.effect("フォルダを自分の配下へは動かせない", () =>
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

  describe("ノードを消したとき", () => {
    it.effect("空でないフォルダは remove では消せない", () =>
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
      "removeTree は中身ごと消し、親と位置を持たず子を含むノードの BookmarkRemoved を 1 回だけ発火する",
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

    it.effect("消したノードより後ろのノードの位置が詰まる", () =>
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

  describe("ノードを読んだとき", () => {
    it.effect("getChildren は子の children を読み込まない", () =>
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

    it.effect("getSubTree は配下をすべて読み込む", () =>
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

    it.effect("存在しないノードは失敗する", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const error = yield* Effect.flip(bookmarks.get(missingNode))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("ノードを探したとき", () => {
    it.effect("すべての語がタイトルに含まれるノードに一致する", () =>
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

    it.effect("url を指定すると完全に一致するブックマークだけを返す", () =>
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

    it.effect("固定のフォルダは結果に含めない", () =>
      Effect.gen(function* () {
        const bookmarks = yield* Bookmarks

        const found = yield* bookmarks.search("bookmarks")

        assert.deepStrictEqual(found, [])
      }),
    )
  })

  describe("ブックマークを仕込んだとき", () => {
    it.effect("イベントは発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        yield* fake.seedBookmarks(bookmarksBar, [{ title: "a", url: "https://a.example/" }])

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )
  })
})
