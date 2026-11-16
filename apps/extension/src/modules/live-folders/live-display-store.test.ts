import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { BookmarkId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { DEFAULT_LIVE_LIMIT, DEFAULT_LIVE_SORT, LiveDisplayStore } from "./live-display-store"

const FOLDER = BookmarkId.make("live-1")
const OTHER = BookmarkId.make("live-2")

const openStore = Effect.gen(function* () {
  return yield* LiveDisplayStore
}).pipe(Effect.provide(LiveDisplayStore.layer))

const chosen = (store: LiveDisplayStore["Service"]) =>
  Effect.all({ sorts: store.sorts, limits: store.limits }).pipe(
    Effect.map(({ sorts, limits }) => ({ sorts: [...sorts], limits: [...limits] })),
  )

describe("LiveDisplayStore", () => {
  it.effect("shows newest first and ten items in a folder nothing was chosen for", () =>
    Effect.gen(function* () {
      const store = yield* openStore

      assert.deepStrictEqual(
        [yield* chosen(store), DEFAULT_LIVE_SORT, DEFAULT_LIVE_LIMIT],
        [{ sorts: [], limits: [] }, "newest", 10],
      )
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("remembers the chosen limit after a restart", () =>
    Effect.gen(function* () {
      yield* (yield* openStore).setLimit(FOLDER, 20)

      const restarted = yield* openStore

      assert.deepStrictEqual([...(yield* restarted.limits)], [[FOLDER, 20]])
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("stores nothing once a folder is back to the default limit", () =>
    Effect.gen(function* () {
      const store = yield* openStore
      yield* store.setLimit(FOLDER, "all")

      yield* store.setLimit(FOLDER, DEFAULT_LIVE_LIMIT)

      assert.isFalse((yield* store.limits).has(FOLDER))
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("keeps a folder's limit apart from its order", () =>
    Effect.gen(function* () {
      const store = yield* openStore
      yield* store.setSort(FOLDER, "title")

      yield* store.setLimit(FOLDER, 5)

      assert.deepStrictEqual(yield* chosen(store), {
        sorts: [[FOLDER, "title"]],
        limits: [[FOLDER, 5]],
      })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("forgetting a folder discards both its order and its limit", () =>
    Effect.gen(function* () {
      const store = yield* openStore
      yield* store.setSort(FOLDER, "oldest")
      yield* store.setLimit(FOLDER, 5)

      yield* store.forget([FOLDER])

      assert.deepStrictEqual(yield* chosen(store), { sorts: [], limits: [] })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("discards the order and the limit of the folders not among those kept", () =>
    Effect.gen(function* () {
      const store = yield* openStore
      yield* store.setLimit(FOLDER, 5)
      yield* store.setSort(OTHER, "source")
      yield* store.setLimit(OTHER, "all")

      yield* store.retainOnly(new Set([OTHER]))

      assert.deepStrictEqual(yield* chosen(store), {
        sorts: [[OTHER, "source"]],
        limits: [[OTHER, "all"]],
      })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("reads the orders an earlier version stored, with the default limit", () =>
    Effect.gen(function* () {
      yield* (yield* FakeBrowser).seedStorage("local", {
        "katip/live-folders/sorts": { [FOLDER]: "title" },
      })

      const store = yield* openStore

      assert.deepStrictEqual(yield* chosen(store), { sorts: [[FOLDER, "title"]], limits: [] })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )
})
