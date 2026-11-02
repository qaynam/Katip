import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Latch, Layer, Schema, Stream } from "effect"
import { SpaceId } from "#modules/space"
import { Storage } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { defaultSettings, IdleMinutes, Settings } from "./settings"
import { SettingsRepository } from "./settings-repository"

const SETTINGS_KEY = "katip/settings"
const SETTINGS_AREA = "sync"

const testLayer = SettingsRepository.layer.pipe(Layer.provideMerge(FakeBrowser.layer))

const changesWhile = <E>(
  repository: SettingsRepository["Service"],
  count: number,
  act: Effect.Effect<unknown, E>,
) =>
  Effect.gen(function* () {
    const subscribed = yield* Latch.make()
    const collecting = yield* repository.changes.pipe(
      Stream.tap(() => Latch.open(subscribed)),
      Stream.take(count),
      Stream.runCollect,
      Effect.forkChild,
    )
    yield* subscribed.await
    yield* act
    return yield* Fiber.join(collecting)
  })

describe("get", () => {
  it.effect("returns the defaults when nothing is stored", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository

      expect(yield* repository.get).toStrictEqual(defaultSettings)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect(
    "reads stored settings with a broken field by falling back to that field's default",
    () =>
      Effect.gen(function* () {
        const repository = yield* SettingsRepository
        yield* (yield* FakeBrowser).seedStorage(SETTINGS_AREA, {
          [SETTINGS_KEY]: { newTabsOnTop: "yes", syncTabGroups: true },
        })

        const settings = yield* repository.get

        expect(settings).toStrictEqual({ ...defaultSettings, syncTabGroups: true })
      }).pipe(Effect.provide(testLayer)),
  )
})

describe("update", () => {
  it.effect("saves only the changed fields, and the next read reflects them", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository

      yield* repository.update({ defaultSpaceId: SpaceId.make("work") })

      expect(yield* repository.get).toStrictEqual({
        ...defaultSettings,
        defaultSpaceId: "work",
      })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("returns the saved settings", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository

      const saved = yield* repository.update({ autoArchive: { enabled: true } })

      expect(saved).toStrictEqual(yield* repository.get)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("changing one auto archive field keeps the other's stored value", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository
      yield* repository.update({ autoArchive: { idleMinutes: IdleMinutes.make(30) } })

      yield* repository.update({ autoArchive: { enabled: true } })

      expect((yield* repository.get).autoArchive).toStrictEqual({ enabled: true, idleMinutes: 30 })
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("concurrent changes are both kept", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository

      yield* Effect.all(
        [repository.update({ syncTabGroups: true }), repository.update({ newTabsOnTop: false })],
        { concurrency: "unbounded" },
      )

      const settings = yield* repository.get
      expect([settings.syncTabGroups, settings.newTabsOnTop]).toStrictEqual([true, false])
    }).pipe(Effect.provide(testLayer)),
  )
})

describe("changes", () => {
  it.effect("emits the current settings first on subscribing", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository
      yield* repository.update({ syncTabGroups: true })

      const emitted = yield* repository.changes.pipe(Stream.take(1), Stream.runCollect)

      expect(emitted).toStrictEqual([{ ...defaultSettings, syncTabGroups: true }])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("emits the saved settings on every save", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository

      const emitted = yield* changesWhile(
        repository,
        3,
        Effect.andThen(
          repository.update({ syncTabGroups: true }),
          repository.update({ newTabsOnTop: false }),
        ),
      )

      expect(
        emitted.map((settings) => [settings.syncTabGroups, settings.newTabsOnTop]),
      ).toStrictEqual([
        [false, true],
        [true, true],
        [true, false],
      ])
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("emits settings saved by another page too", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository
      const storage = yield* Storage
      const savedElsewhere: Settings = { ...defaultSettings, syncTabGroups: true }

      const emitted = yield* changesWhile(
        repository,
        2,
        storage[SETTINGS_AREA].set(SETTINGS_KEY, Schema.encodeSync(Settings)(savedElsewhere)),
      )

      expect(emitted.at(-1)).toStrictEqual(savedElsewhere)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("doesn't emit when a stored value other than the settings changes", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository
      const storage = yield* Storage

      const emitted = yield* changesWhile(
        repository,
        2,
        Effect.andThen(
          storage[SETTINGS_AREA].set("katip/unrelated", 1),
          repository.update({ syncTabGroups: true }),
        ),
      )

      expect(emitted.at(-1)?.syncTabGroups).toBe(true)
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("emits the defaults when the stored value is removed", () =>
    Effect.gen(function* () {
      const repository = yield* SettingsRepository
      const storage = yield* Storage
      yield* repository.update({ syncTabGroups: true })

      const emitted = yield* changesWhile(
        repository,
        2,
        storage[SETTINGS_AREA].remove(SETTINGS_KEY),
      )

      expect(emitted.at(-1)).toStrictEqual(defaultSettings)
    }).pipe(Effect.provide(testLayer)),
  )
})
