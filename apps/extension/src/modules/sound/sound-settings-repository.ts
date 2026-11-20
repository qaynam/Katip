import { Cause, Context, Effect, Layer, Option, Queue, Schema, Semaphore, Stream } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { type KnownOutputs, knownOutputsOfStored, withOutputsNoted } from "./known-outputs"
import { SoundRules, soundRulesOfStored } from "./sound-rules"

// Local, not sync like the settings: an output's name only means something on the computer it
// was chosen on
const SOUND_RULES_KEY = "katip/sound-rules"
const KNOWN_OUTPUTS_KEY = "katip/sound-outputs"

const decodeStored = (stored: Option.Option<unknown>): SoundRules =>
  soundRulesOfStored(Option.getOrUndefined(stored))

const encodeForStorage = (rules: SoundRules) =>
  // Rules that passed the type check can't fail to encode; if they do, whoever built the invalid
  // value is at fault
  Effect.orDie(Schema.encodeEffect(SoundRules)(rules))

const makeSoundSettings = Effect.fnUntraced(function* (area: StorageArea) {
  // Another update slipping in between the read and the write would lose the earlier write
  const writeLock = yield* Semaphore.make(1)

  const get = Effect.map(area.get(SOUND_RULES_KEY), decodeStored)

  const update = Effect.fn("SoundSettings.update")(function* (
    change: (rules: SoundRules) => SoundRules,
  ) {
    const updated = change(yield* get)
    yield* area.set(SOUND_RULES_KEY, yield* encodeForStorage(updated))
    return updated
  }, Semaphore.withPermit(writeLock))

  const storedChanges = area.changes.pipe(
    Stream.filter((change) => change.key === SOUND_RULES_KEY),
    Stream.map((change) => decodeStored(change.newValue)),
  )

  // Subscribing before reading: the other way round would miss a change saved in between
  const changes = Stream.unwrap(
    Effect.gen(function* () {
      const pending = yield* Queue.unbounded<SoundRules, Cause.Done>()
      yield* Effect.forkScoped(Stream.runIntoQueue(storedChanges, pending), {
        startImmediately: true,
      })
      const current = yield* get
      return Stream.concat(Stream.succeed(current), Stream.fromQueue(pending))
    }),
  )

  const knownOutputs = Effect.map(area.get(KNOWN_OUTPUTS_KEY), (stored) =>
    knownOutputsOfStored(Option.getOrUndefined(stored)),
  )

  const noteOutputs = Effect.fn("SoundSettings.noteOutputs")(function* (
    seen: ReadonlyArray<string>,
  ) {
    const known = yield* knownOutputs
    const noted = withOutputsNoted(known, seen)
    // Pages report on every device change; most bring no name that isn't known
    if (noted.length !== known.length) yield* area.set(KNOWN_OUTPUTS_KEY, noted)
  }, Semaphore.withPermit(writeLock))

  return SoundSettings.of({ get, update, changes, knownOutputs, noteOutputs })
})

/** The sound settings kept for sites. */
export class SoundSettings extends Context.Service<
  SoundSettings,
  {
    /** Doesn't fail on missing or broken saved settings; see {@link soundRulesOfStored}. */
    readonly get: Effect.Effect<SoundRules, BrowserApiError>
    /**
     * Saves `change` applied to the latest saved settings, and returns what was saved. Concurrent
     * calls are applied one at a time.
     */
    update(change: (rules: SoundRules) => SoundRules): Effect.Effect<SoundRules, BrowserApiError>
    /**
     * Emits the settings as of subscribing first, then the new ones whenever the saved ones change,
     * including saves from other pages.
     */
    readonly changes: Stream.Stream<SoundRules, BrowserApiError>
    /** The names of the outputs pages have seen; see {@link KnownOutputs}. */
    readonly knownOutputs: Effect.Effect<KnownOutputs, BrowserApiError>
    /** Keeps the names of the outputs a page saw, along with those seen before. */
    noteOutputs(seen: ReadonlyArray<string>): Effect.Effect<void, BrowserApiError>
  }
>()("katip/sound/SoundSettings") {
  static readonly layer = Layer.effect(
    SoundSettings,
    Effect.gen(function* () {
      const storage = yield* Storage
      return yield* makeSoundSettings(storage.local)
    }),
  )
}
