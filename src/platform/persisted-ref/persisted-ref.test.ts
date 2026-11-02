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
  it.effect("starts from the initial value and reports nothing stored when storage is empty", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      assert.deepStrictEqual([yield* ref.get, ref.wasStored], [{ count: 0 }, false])
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("starts from the stored value when there is one", () =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", { [KEY]: { count: 7 } })

      const ref = yield* counterRef

      assert.deepStrictEqual([yield* ref.get, ref.wasStored], [{ count: 7 }, true])
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("starts from the initial value when the stored value does not decode", () =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", { [KEY]: { count: "broken" } })

      const ref = yield* counterRef

      assert.deepStrictEqual(yield* ref.get, { count: 0 })
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("saves updated values to storage", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      yield* ref.update((counter) => ({ count: counter.count + 1 }))

      assert.deepStrictEqual(yield* storedCount, Option.some({ count: 1 }))
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("leaves both the value and storage unchanged when an update fails", () =>
    Effect.gen(function* () {
      const ref = yield* counterRef

      const result = yield* ref
        .updateEffect(() => Effect.fail("rejected" as const))
        .pipe(Effect.flip)

      assert.deepStrictEqual(
        [result, yield* ref.get, yield* storedCount],
        ["rejected", { count: 0 }, Option.none()],
      )
    }).pipe(Effect.provide(FakeBrowser.layer)),
  )

  it.effect("loses no update when updates run concurrently", () =>
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
