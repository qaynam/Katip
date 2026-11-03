import { Cause, Context, Effect, Layer, Option, Queue, Schema, Semaphore, Stream } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { applySettingsPatch, Settings, type SettingsPatch } from "./settings"

const SETTINGS_KEY = "katip/settings"

const decodeStored = (stored: Option.Option<unknown>): Settings =>
  Schema.decodeUnknownSync(Settings)(Option.getOrUndefined(stored))

const encodeForStorage = (settings: Settings) =>
  // A Settings that passed the type check can't fail to encode; if it does, whoever built the
  // invalid value is at fault
  Effect.orDie(Schema.encodeEffect(Settings)(settings))

const makeSettingsRepository = Effect.fnUntraced(function* (area: StorageArea) {
  // Another update slipping in between the read and the write would lose the earlier write
  const writeLock = yield* Semaphore.make(1)

  const get = Effect.map(area.get(SETTINGS_KEY), decodeStored)

  const update = Effect.fn("SettingsRepository.update")(function* (patch: SettingsPatch) {
    const updated = applySettingsPatch(yield* get, patch)
    yield* area.set(SETTINGS_KEY, yield* encodeForStorage(updated))
    return updated
  }, Semaphore.withPermit(writeLock))

  const storedChanges = area.changes.pipe(
    Stream.filter((change) => change.key === SETTINGS_KEY),
    Stream.map((change) => decodeStored(change.newValue)),
  )

  // Subscribing before reading: the other way round would miss a change another page saves in
  // between
  const changes = Stream.unwrap(
    Effect.gen(function* () {
      const pending = yield* Queue.unbounded<Settings, Cause.Done>()
      yield* Effect.forkScoped(Stream.runIntoQueue(storedChanges, pending), {
        startImmediately: true,
      })
      const current = yield* get
      return Stream.concat(Stream.succeed(current), Stream.fromQueue(pending))
    }),
  )

  return SettingsRepository.of({ get, update, changes })
})

export class SettingsRepository extends Context.Service<
  SettingsRepository,
  {
    /** Doesn't fail on a missing or broken stored value; those fields fall back to defaults. */
    readonly get: Effect.Effect<Settings, BrowserApiError>
    /**
     * Saves the patch applied over the latest stored settings, and returns the saved settings.
     * Concurrent calls are applied one at a time.
     */
    update(patch: SettingsPatch): Effect.Effect<Settings, BrowserApiError>
    /**
     * Emits the settings as of subscribing first, then the new settings whenever the stored value
     * changes, including saves from other pages (the background, the side panel, and so on).
     */
    readonly changes: Stream.Stream<Settings, BrowserApiError>
  }
>()("katip/settings/SettingsRepository") {
  static readonly layer = Layer.effect(
    SettingsRepository,
    Effect.gen(function* () {
      const storage = yield* Storage
      return yield* makeSettingsRepository(storage.sync)
    }),
  )
}
