import { assert, describe, layer } from "@effect/vitest"
import { Effect, Fiber, Option, Schema, Stream } from "effect"
import { Storage, type StorageArea } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const collectChanges = (area: StorageArea, count: number) =>
  Effect.forkChild(area.changes.pipe(Stream.take(count), Stream.runCollect), {
    startImmediately: true,
  })

layer(FakeBrowser.layer, { buildPerTest: true })("Storage の fake", (it) => {
  describe("値を読み書きしたとき", () => {
    it.effect("保存されていないキーは None になる", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        const value = yield* storage.local.get("missing")

        assert.deepStrictEqual(value, Option.none())
      }),
    )

    it.effect("保存した値は JSON を通った形で読み戻される", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        yield* storage.local.set("entry", { at: new Date(0), dropped: undefined })

        assert.deepStrictEqual(
          yield* storage.local.get("entry"),
          Option.some({ at: "1970-01-01T00:00:00.000Z" }),
        )
      }),
    )

    it.effect("local・session・sync は別々の領域になっている", () =>
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

  describe("変更を購読しているとき", () => {
    it.effect("値を変えると、変更前と変更後の値が流れる", () =>
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

    it.effect("同じ値を書いても流れない", () =>
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

    it.effect("削除すると、変更後の値が None の変更が流れる", () =>
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

    it.effect("購読を始める前の変更は流れない", () =>
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

    it.effect("仕込んだ値は変更として流れない", () =>
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

  describe("decode して読んだとき", () => {
    const Counter = Schema.Struct({ count: Schema.Number })

    it.effect("形の合う値は decode した値になる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const storage = yield* Storage
        yield* fake.seedStorage("local", { counter: { count: 3 } })

        const counter = yield* storage.local.getDecoded("counter", Counter)

        assert.deepStrictEqual(counter, Option.some({ count: 3 }))
      }),
    )

    it.effect("形の合わない値は StorageDecodeError で失敗する", () =>
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

    it.effect("保存されていなければ None になる", () =>
      Effect.gen(function* () {
        const storage = yield* Storage

        const counter = yield* storage.local.getDecoded("counter", Counter)

        assert.deepStrictEqual(counter, Option.none())
      }),
    )
  })

  describe("並行して読み書きしたとき", () => {
    it.effect(
      "読み書きのたびに処理を手放すので、排他しない read-modify-write は更新を取りこぼす",
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

  describe("失敗を仕込んだとき", () => {
    it.effect("次の 1 回だけ BrowserApiError で失敗し、値は書き換わらない", () =>
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

    it.effect("get に仕込んだ失敗は getDecoded にも効く", () =>
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
