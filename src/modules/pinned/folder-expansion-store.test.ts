import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BookmarkId, Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { isFolderExpanded } from "./folder-expansion"
import { FolderExpansionStore } from "./folder-expansion-store"

const TestLayer = FolderExpansionStore.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const folderA = BookmarkId.make("a")
const folderB = BookmarkId.make("b")

describe("フォルダの開閉状態の保存", () => {
  it.effect("保存した開閉状態を読み直せる", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore

      yield* store.setExpanded(folderA, true)
      yield* store.setExpanded(folderB, false)

      const expansion = yield* store.load
      assert.isTrue(isFolderExpanded(expansion, folderA))
      assert.isFalse(isFolderExpanded(expansion, folderB))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("同じフォルダへ続けて書き込むと、最後の値が残る", () =>
    Effect.gen(function* () {
      const store = yield* FolderExpansionStore

      yield* store.setExpanded(folderA, true)
      yield* store.setExpanded(folderA, false)

      assert.isFalse(isFolderExpanded(yield* store.load, folderA))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("別々のフォルダへ並行して書き込んでも、どちらの書き込みも失われない", () =>
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

  it.effect("忘れたフォルダは閉じた状態に戻り、ほかのフォルダの状態は残る", () =>
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

  it.effect("保存値が壊れていたら、すべてのフォルダを閉じた状態として読む", () =>
    Effect.gen(function* () {
      const storage = yield* Storage
      const store = yield* FolderExpansionStore
      yield* storage.local.set("katip/pinned/folder-expansion", "broken")

      const expansion = yield* store.load

      assert.deepStrictEqual(expansion, {})
    }).pipe(Effect.provide(TestLayer)),
  )
})
