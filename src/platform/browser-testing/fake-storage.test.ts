import { assert, describe, layer } from "@effect/vitest"
import { Effect, Fiber, Option, Schema, Stream } from "effect"
import { Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const collectChanges = (area: StorageArea, count: number) =>
  Effect.forkChild(area.changes.pipe(Stream.take(count), Stream.runCollect), {
    startImmediately: true,
  })

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Storage", (it) => {
  describe("reading and writing values", () => {
    it.effect("a key with nothing stored reads as None", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        const value = yield* storage.local.get("missing")

        assert.deepStrictEqual(value, Option.none())
      }),
    )

    it.effect("a stored value reads back as it comes out of JSON", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        yield* storage.local.set("entry", { at: new Date(0), dropped: undefined })

        assert.deepStrictEqual(
          yield* storage.local.get("entry"),
          Option.some({ at: "1970-01-01T00:00:00.000Z" }),
        )
      }),
    )

    it.effect("local, session and sync are separate areas", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        yield* storage.local.set("key", "local")
        yield* storage.sync.set("key", "sync")

        assert.deepStrictEqual(
          [
            yield* storage.local.get("key"),
            yield* storage.session.get("key"),
            yield* storage.sync.get("key"),
          ],
          [Option.some("local"), Option.none(), Option.some("sync")],
        )
      }),
    )
  })

  describe("while subscribed to changes", () => {
    it.effect("changing a value emits the old and new values", () =>
      Effect.gen(function* () {
        const storage = yield* Storage
        const changes = yield* collectChanges(storage.local, 2)

        yield* storage.local.set("count", 1)
        yield* storage.local.set("count", 2)

        assert.deepStrictEqual(yield* Fiber.join(changes), [
          { key: "count", oldValue: Option.none(), newValue: Option.some(1) },
          { key: "count", oldValue: Option.some(1), newValue: Option.some(2) },
        ])
      }),
    )

    it.effect("writing the same value emits nothing", () =>
      Effect.gen(function* () {
        const storage = yield* Storage
        const changes = yield* collectChanges(storage.local, 2)

        yield* storage.local.set("count", 1)
        yield* storage.local.set("count", 1)
        yield* storage.local.set("count", 2)

        assert.deepStrictEqual(
          (yield* Fiber.join(changes)).map(({ newValue }) => newValue),
          [Option.some(1), Option.some(2)],
        )
      }),
    )

    it.effect("removing a value emits a change whose new value is None", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.seedStorage("local", { count: 1 })
        const changes = yield* collectChanges(storage.local, 1)

        yield* storage.local.remove("count")

        assert.deepStrictEqual(yield* Fiber.join(changes), [
          { key: "count", oldValue: Option.some(1), newValue: Option.none() },
        ])
      }),
    )

    it.effect("changes from before subscribing are not emitted", () =>
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.local.set("count", 1)
        const changes = yield* collectChanges(storage.local, 1)

        yield* storage.local.set("count", 2)

        assert.deepStrictEqual(yield* Fiber.join(changes), [
          { key: "count", oldValue: Option.some(1), newValue: Option.some(2) },
        ])
      }),
    )

    it.effect("seeded values are not emitted as changes", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        const changes = yield* collectChanges(storage.local, 1)

        yield* fake.seedStorage("local", { seeded: true })
        yield* storage.local.set("written", true)

        assert.deepStrictEqual(
          (yield* Fiber.join(changes)).map(({ key }) => key),
          ["written"],
        )
      }),
    )
  })

  describe("reading with decoding", () => {
    const Counter = Schema.Struct({ count: Schema.Number })

    it.effect("a value that fits the schema reads as the decoded value", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.seedStorage("local", { counter: { count: 3 } })

        const counter = yield* storage.local.getDecoded("counter", Counter)

        assert.deepStrictEqual(counter, Option.some({ count: 3 }))
      }),
    )

    it.effect("a value that does not fit fails with StorageDecodeError", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.seedStorage("session", { counter: { count: "three" } })

        const error = yield* Effect.flip(storage.session.getDecoded("counter", Counter))

        assert.deepStrictEqual(
          [error._tag, error._tag === "StorageDecodeError" && [error.area, error.key]],
          ["StorageDecodeError", ["session", "counter"]],
        )
      }),
    )

    it.effect("nothing stored reads as None", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        const counter = yield* storage.local.getDecoded("counter", Counter)

        assert.deepStrictEqual(counter, Option.none())
      }),
    )
  })

  describe("reading and writing concurrently", () => {
    it.effect(
      "loses an update in an unguarded read-modify-write, since every read and write yields",
      () =>
        Effect.gen(function* () {
          const storage = yield* Storage
          const increment = Effect.gen(function* () {
            const current = yield* storage.local.getDecoded("count", Schema.Number)
            yield* storage.local.set("count", Option.getOrElse(current, () => 0) + 1)
          })

          yield* Effect.all([increment, increment], { concurrency: "unbounded" })

          assert.deepStrictEqual(yield* storage.local.get("count"), Option.some(1))
        }),
    )
  })

  describe("injecting a failure", () => {
    it.effect("fails only the next call with BrowserApiError and leaves the value unchanged", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.failNext("storage.local.set")

        const error = yield* Effect.flip(storage.local.set("count", 1))
        yield* storage.local.set("other", 1)

        assert.strictEqual(error._tag, "BrowserApiError")
        assert.deepStrictEqual(yield* storage.local.get("count"), Option.none())
        assert.deepStrictEqual(yield* storage.local.get("other"), Option.some(1))
      }),
    )

    it.effect("a failure injected into get applies to getDecoded too", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.failNext("storage.sync.get")

        const error = yield* Effect.flip(storage.sync.getDecoded("settings", Schema.Unknown))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })
})
