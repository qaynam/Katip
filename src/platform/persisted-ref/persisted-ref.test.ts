import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Option, Schema } from "effect"
import { Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { makePersistedRef } from "./persisted-ref"

const Counter = Schema.Struct({ count: Schema.Int })
const KEY = "test/counter"

const counterRef = Effect.gen(function* () {
  const storage = yield* Storage
  return yield* makePersistedRef({
    area: storage.local,
    key: KEY,
    schema: Counter,
    initial: () => ({ count: 0 }),
  })
})

const storedCount = Effect.gen(function* () {
  const storage = yield* Storage
  return yield* storage.local.getDecoded(KEY, Counter)
})

describe("makePersistedRef", () => {
  it.effect("保存値が無ければ初期値から始まり、保存済みではないと分かる", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      assert.deepStrictEqual([yield* ref.get, ref.wasStored], [{ count: 0 }, false])
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("保存値があればその値から始まる", () =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", { [KEY]: { count: 7 } })

      const ref = yield* counterRef

      assert.deepStrictEqual([yield* ref.get, ref.wasStored], [{ count: 7 }, true])
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("保存値の形が合わなければ初期値から始まる", () =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", { [KEY]: { count: "broken" } })

      const ref = yield* counterRef

      assert.deepStrictEqual(yield* ref.get, { count: 0 })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("更新した値は storage にも保存される", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      yield* ref.update((counter) => ({ count: counter.count + 1 }))

      assert.deepStrictEqual(yield* storedCount, Option.some({ count: 1 }))
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("更新が失敗したら値も保存値も変わらない", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      const result = yield* ref.updateEffect(() => Effect.fail("拒否" as const)).pipe(Effect.flip)

      assert.deepStrictEqual(
        [result, yield* ref.get, yield* storedCount],
        ["拒否", { count: 0 }, Option.none()],
      )
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("同時に更新しても、どの更新も失われない", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      const fibers = yield* Effect.forEach(Array.from({ length: 10 }), () =>
        Effect.forkChild(ref.update((counter) => ({ count: counter.count + 1 }))),
      )
      yield* Fiber.joinAll(fibers)

      assert.deepStrictEqual(
        [yield* ref.get, yield* storedCount],
        [{ count: 10 }, Option.some({ count: 10 })],
      )
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )
})
