import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import { Alarms } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Alarms", (it) => {
  describe("creating an alarm", () => {
    it.effect("with only a period, schedules it one period from now", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms
        yield* TestClock.adjust(1000)

        yield* alarms.create("tick", { periodInMinutes: 1 })

        assert.deepStrictEqual(yield* alarms.getAll, [
          { name: "tick", scheduledTime: 61_000, periodInMinutes: Option.some(1) },
        ])
      }),
    )

    it.effect("with a time, schedules it once at that time", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms

        yield* alarms.create("once", { when: 5000 })

        assert.deepStrictEqual(yield* alarms.getAll, [
          { name: "once", scheduledTime: 5000, periodInMinutes: Option.none() },
        ])
      }),
    )

    it.effect("with an existing name, replaces that alarm", () =>
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

  describe("clearing an alarm", () => {
    it.effect("returns whether there was an alarm to clear", () =>
      Effect.gen(function* () {
        const alarms = yield* Alarms
        yield* alarms.create("tick", { periodInMinutes: 1 })

        const results = [yield* alarms.clear("tick"), yield* alarms.clear("tick")]

        assert.deepStrictEqual(results, [true, false])
      }),
    )
  })

  describe("when an alarm fires", () => {
    it.effect("a one-off alarm fires AlarmFired and is cleared", () =>
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

    it.effect("a repeating alarm moves on to its next time", () =>
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

    it.effect("firing a missing alarm fails", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const error = yield* Effect.flip(fake.fireAlarm("missing"))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })
})
