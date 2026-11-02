import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BookmarkId, Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FolderIconStore } from "./folder-icon-store"

const TestLayer = FolderIconStore.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const folderA = BookmarkId.make("a")
const folderB = BookmarkId.make("b")

describe("saving folder icons", () => {
  it.effect("the chosen icons can be loaded back", () =>
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

  it.effect("choosing again for the same folder keeps the last icon chosen", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore

      yield* store.setIcon(folderA, "star")
      yield* store.setIcon(folderA, "leaf")

      assert.deepStrictEqual(yield* store.load, new Map([[folderA, "leaf"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("icons chosen concurrently for different folders are both kept", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore

      yield* Effect.all([store.setIcon(folderA, "star"), store.setIcon(folderB, "moon")], {
        concurrency: "unbounded",
      })

      assert.strictEqual((yield* store.load).size, 2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a forgotten folder loses its icon while other folders keep theirs", () =>
    Effect.gen(function* () {
      const store = yield* FolderIconStore
      yield* store.setIcon(folderA, "star")
      yield* store.setIcon(folderB, "moon")

      yield* store.forget([folderA])

      assert.deepStrictEqual(yield* store.load, new Map([[folderB, "moon"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("only the folders saved with an unknown icon name read as having no icon", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderIconStore
      yield* storage.local.set("katip/pinned/folder-icons", { a: "unicorn", b: "moon" })

      assert.deepStrictEqual(yield* store.load, new Map([[folderB, "moon"]]))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a broken saved value reads as no folder having an icon", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderIconStore
      yield* storage.local.set("katip/pinned/folder-icons", "broken")

      assert.strictEqual((yield* store.load).size, 0)
    }).pipe(Effect.provide(TestLayer)),
  )
})
