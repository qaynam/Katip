import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BookmarkId, Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FolderIconStore } from "./folder-icon-store"

const TestLayer = FolderIconStore.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const folderA = BookmarkId.make("a")
const folderB = BookmarkId.make("b")

describe("フォルダのアイコンの保存", () => {
  it.effect("選んだアイコンを読み直せる", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore

      yield* store.setIcon(folderA, "star")
      yield* store.setIcon(folderB, "moon")

      assert.deepStrictEqual(
        yield* store.load,
        new Map([
          [folderA, "star"],
          [folderB, "moon"],
        ]),
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("同じフォルダに選び直すと、最後に選んだアイコンが残る", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore

      yield* store.setIcon(folderA, "star")
      yield* store.setIcon(folderA, "leaf")

      assert.deepStrictEqual(yield* store.load, new Map([[folderA, "leaf"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("別々のフォルダへ並行して選んでも、どちらのアイコンも失われない", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore

      yield* Effect.all([store.setIcon(folderA, "star"), store.setIcon(folderB, "moon")], {
        concurrency: "unbounded",
      })

      assert.strictEqual((yield* store.load).size, 2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("忘れたフォルダはアイコンを持たなくなり、ほかのフォルダのアイコンは残る", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore
      yield* store.setIcon(folderA, "star")
      yield* store.setIcon(folderB, "moon")

      yield* store.forget([folderA])

      assert.deepStrictEqual(yield* store.load, new Map([[folderB, "moon"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("知らない名前で保存されたフォルダだけを、アイコンを持たないものとして読む", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderIconStore
      yield* storage.local.set("katip/pinned/folder-icons", { a: "unicorn", b: "moon" })

      assert.deepStrictEqual(yield* store.load, new Map([[folderB, "moon"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("保存値が壊れていたら、どのフォルダもアイコンを持たないものとして読む", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderIconStore
      yield* storage.local.set("katip/pinned/folder-icons", "broken")

      assert.strictEqual((yield* store.load).size, 0)
    }).pipe(Effect.provide(TestLayer)),
  )
})
