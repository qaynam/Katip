import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { makeHeldStream } from "./held-stream"

const subscribeNow = <A>(stream: Stream.Stream<A>) =>
  Effect.forkChild(Stream.runCollect(stream), { startImmediately: true })

describe("購読者が現れる前に送られた値", () => {
  it.effect("最初の購読者が送られた順に受け取る", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.push(1)
      held.push(2)

      const received = yield* held.stream.pipe(Stream.take(2), Stream.runCollect)

      assert.deepStrictEqual(received, [1, 2])
    }),
  )

  it.effect("2 番目の購読者には渡らない", () =>
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

describe("購読中に送られた値", () => {
  it.effect("購読しているすべての購読者が受け取る", () =>
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

  it.effect("購読をやめた後の値は受け取らない", () =>
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

describe("終わった後", () => {
  it.effect("購読すると溜まっていた値を受け取ってすぐ終わる", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.push(1)
      held.end()

      const received = yield* Stream.runCollect(held.stream)

      assert.deepStrictEqual(received, [1])
    }),
  )

  it.effect("送った値は捨てられる", () =>
    Effect.gen(function* () {
      const held = makeHeldStream<number>()
      held.end()
      held.push(1)

      const received = yield* Stream.runCollect(held.stream)

      assert.deepStrictEqual(received, [])
    }),
  )
})
