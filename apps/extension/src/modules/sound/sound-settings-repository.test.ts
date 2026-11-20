import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Latch, Layer, Stream } from "effect"
import { Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import type { SoundRule } from "./sound-rule"
import { withRule } from "./sound-rules"
import { SoundSettings } from "./sound-settings-repository"
import { SoundSite } from "./sound-site"

const testLayer = SoundSettings.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const youtube: SoundRule = {
  site: SoundSite.make("https://www.youtube.com"),
  output: "External Speaker",
  volume: 1,
  method: "InPage",
}

describe("the saved sound settings", () => {
  it.effect("are none until something is saved", () =>
    Effect.gen(function* () {
      expect(yield* (yield* SoundSettings).get).toStrictEqual([])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("keep an update, which the next read returns", () =>
    Effect.gen(function* () {
      const settings = yield* SoundSettings

      const saved = yield* settings.update((rules) => withRule(rules, youtube))

      expect([saved, yield* settings.get]).toStrictEqual([[youtube], [youtube]])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("tell about a save made elsewhere, after the settings as of subscribing", () =>
    Effect.gen(function* () {
      const settings = yield* SoundSettings
      const storage = yield* Storage
      const subscribed = yield* Latch.make()
      const collecting = yield* settings.changes.pipe(
        Stream.tap(() => Latch.open(subscribed)),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* subscribed.await

      yield* storage.local.set("katip/sound-rules", [youtube])

      expect(yield* Fiber.join(collecting)).toStrictEqual([[], [youtube]])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect(
    "keep the names of the outputs pages saw, adding new ones after those seen before",
    () =>
      Effect.gen(function* () {
        const settings = yield* SoundSettings

        yield* settings.noteOutputs(["MacBook Pro Speakers"])
        yield* settings.noteOutputs(["External Speaker", "MacBook Pro Speakers"])

        expect(yield* settings.knownOutputs).toStrictEqual([
          "MacBook Pro Speakers",
          "External Speaker",
        ])
      }).pipe(Effect.provide(testLayer)),
  )
})
