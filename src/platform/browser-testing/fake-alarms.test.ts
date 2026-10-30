import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import { Alarms } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

layer(FakeBrowser.layer, { buildPerTest: true })("Alarms の fake", (it) => {
  describe("アラームを作ったとき", () => {
    it.effect("間隔だけを指定すると、今からその間隔の後に予定される", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms
        yield* TestClock.adjust(1000)

        yield* alarms.create("tick", { periodInMinutes: 1 })

        assert.deepStrictEqual(yield* alarms.getAll, [
          { name: "tick", scheduledTime: 61_000, periodInMinutes: Option.some(1) },
        ])
      }),
    )

    it.effect("時刻を指定すると、その時刻に一度だけ予定される", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms

        yield* alarms.create("once", { when: 5000 })

        assert.deepStrictEqual(yield* alarms.getAll, [
          { name: "once", scheduledTime: 5000, periodInMinutes: Option.none() },
        ])
      }),
    )

    it.effect("同じ名前で作ると置き換わる", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms
        yield* alarms.create("tick", { periodInMinutes: 1 })

        yield* alarms.create("tick", { delayInMinutes: 2 })

        assert.deepStrictEqual(
          (yield* alarms.getAll).map(({ name, scheduledTime }) => [name, scheduledTime]),
          [["tick", 120_000]],
        )
      }),
    )
  })

  describe("アラームを消したとき", () => {
    it.effect("消したアラームがあったかどうかを返す", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms
        yield* alarms.create("tick", { periodInMinutes: 1 })

        const results = [yield* alarms.clear("tick"), yield* alarms.clear("tick")]

        assert.deepStrictEqual(results, [true, false])
      }),
    )
  })

  describe("アラームが鳴ったとき", () => {
    it.effect("一度きりのアラームは AlarmFired を発火して消える", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const alarms = yield* Alarms
        yield* alarms.create("once", { when: 5000 })

        yield* fake.fireAlarm("once")

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          {
            _tag: "AlarmFired",
            alarm: { name: "once", scheduledTime: 5000, periodInMinutes: Option.none() },
          },
        ])
        assert.deepStrictEqual(yield* alarms.getAll, [])
      }),
    )

    it.effect("繰り返しのアラームは次の時刻に進む", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const alarms = yield* Alarms
        yield* alarms.create("tick", { periodInMinutes: 1 })

        yield* fake.fireAlarm("tick")

        assert.deepStrictEqual(
          (yield* alarms.getAll).map(({ scheduledTime }) => scheduledTime),
          [120_000],
        )
      }),
    )

    it.effect("無いアラームを鳴らそうとすると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const error = yield* Effect.flip(fake.fireAlarm("missing"))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })
})
