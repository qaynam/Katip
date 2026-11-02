import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BookmarkId, Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { isFolderExpanded } from "./folder-expansion"
import { FolderExpansionStore } from "./folder-expansion-store"

const TestLayer = FolderExpansionStore.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const folderA = BookmarkId.make("a")
const folderB = BookmarkId.make("b")

describe("saving folder expansion", () => {
  it.effect("the saved expansion states can be loaded back", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore

      yield* store.setExpanded(folderA, true)
      yield* store.setExpanded(folderB, false)

      const expansion = yield* store.load
      assert.isTrue(isFolderExpanded(expansion, folderA))
      assert.isFalse(isFolderExpanded(expansion, folderB))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writing the same folder twice in a row keeps the last value", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore

      yield* store.setExpanded(folderA, true)
      yield* store.setExpanded(folderA, false)

      assert.isFalse(isFolderExpanded(yield* store.load, folderA))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("concurrent writes to different folders are both kept", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore

      yield* Effect.all([store.setExpanded(folderA, true), store.setExpanded(folderB, true)], {
        concurrency: "unbounded",
      })

      const expansion = yield* store.load
      assert.isTrue(isFolderExpanded(expansion, folderA))
      assert.isTrue(isFolderExpanded(expansion, folderB))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a forgotten folder goes back to collapsed while other folders keep their state", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore
      yield* store.setExpanded(folderA, true)
      yield* store.setExpanded(folderB, true)

      yield* store.forget([folderA])

      const expansion = yield* store.load
      assert.isFalse(isFolderExpanded(expansion, folderA))
      assert.isTrue(isFolderExpanded(expansion, folderB))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("a broken saved value reads as every folder collapsed", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderExpansionStore
      yield* storage.local.set("katip/pinned/folder-expansion", "broken")

      const expansion = yield* store.load

      assert.deepStrictEqual(expansion, {})
    }).pipe(Effect.provide(TestLayer)),
  )
})
