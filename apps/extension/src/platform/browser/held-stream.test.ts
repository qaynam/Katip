import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { makeHeldStream } from "./held-stream"

const subscribeNow = <A>(stream: Stream.Stream<A>) =>
  Effect.forkChild(Stream.runCollect(stream), { startImmediately: true })

describe("values pushed before anyone subscribes", () => {
  it.effect("go to the first subscriber in the order they were pushed", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.push(1)
      held.push(2)

      const received = yield* held.stream.pipe(Stream.take(2), Stream.runCollect)

      assert.deepStrictEqual(received, [1, 2])
    }),
  )

  it.effect("do not go to the second subscriber", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.push(1)
      yield* held.stream.pipe(Stream.take(1), Stream.runDrain)
      held.end()

      const received = yield* Stream.runCollect(held.stream)

      assert.deepStrictEqual(received, [])
    }),
  )
})

describe("values pushed while subscribed", () => {
  it.effect("go to every current subscriber", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      const first = yield* subscribeNow(held.stream)
      const second = yield* subscribeNow(held.stream)

      held.push(1)
      held.end()

      assert.deepStrictEqual(yield* Fiber.join(first), [1])
      assert.deepStrictEqual(yield* Fiber.join(second), [1])
    }),
  )

  it.effect("do not go to a subscriber after it stops", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      const stopped = yield* held.stream.pipe(Stream.take(1), Stream.runCollect, (collect) =>
        Effect.forkChild(collect, { startImmediately: true }),
      )
      const staying = yield* subscribeNow(held.stream)

      held.push(1)
      held.push(2)
      held.end()

      assert.deepStrictEqual(yield* Fiber.join(stopped), [1])
      assert.deepStrictEqual(yield* Fiber.join(staying), [1, 2])
    }),
  )
})

describe("after the stream ends", () => {
  it.effect("a subscriber receives the held values and ends at once", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.push(1)
      held.end()

      const received = yield* Stream.runCollect(held.stream)

      assert.deepStrictEqual(received, [1])
    }),
  )

  it.effect("pushed values are dropped", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.end()
      held.push(1)

      const received = yield* Stream.runCollect(held.stream)

      assert.deepStrictEqual(received, [])
    }),
  )
})
