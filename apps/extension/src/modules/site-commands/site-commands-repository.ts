import { Cause, Context, Effect, Layer, Option, Queue, Schema, Semaphore, Stream } from "effect"
import { type BrowserApiError, Storage, type StorageArea } from "#platform/browser"
import { SiteCommandList, siteCommandListOfStored } from "./site-command-list"

// Local rather than sync storage like the settings: sync storage holds at most 8 KB per item, which
// a few dozen commands would outgrow
const SITE_COMMANDS_KEY = "katip/site-commands"

const decodeStored = (stored: Option.Option<unknown>): SiteCommandList =>
  siteCommandListOfStored(Option.getOrUndefined(stored))

const encodeForStorage = (list: SiteCommandList) =>
  // A list that passed the type check can't fail to encode; if it does, whoever built the invalid
  // value is at fault
  Effect.orDie(Schema.encodeEffect(SiteCommandList)(list))

const makeSiteCommands = Effect.fnUntraced(function* (area: StorageArea) {
  // Another update slipping in between the read and the write would lose the earlier write
  const writeLock = yield* Semaphore.make(1)

  const get = Effect.map(area.get(SITE_COMMANDS_KEY), decodeStored)

  const update = Effect.fn("SiteCommands.update")(function* (
    change: (list: SiteCommandList) => SiteCommandList,
  ) {
    const updated = change(yield* get)
    yield* area.set(SITE_COMMANDS_KEY, yield* encodeForStorage(updated))
    return updated
  }, Semaphore.withPermit(writeLock))

  const storedChanges = area.changes.pipe(
    Stream.filter((change) => change.key === SITE_COMMANDS_KEY),
    Stream.map((change) => decodeStored(change.newValue)),
  )

  // Subscribing before reading: the other way round would miss a change saved in between
  const changes = Stream.unwrap(
    Effect.gen(function* () {
      const pending = yield* Queue.unbounded<SiteCommandList, Cause.Done>()
      yield* Effect.forkScoped(Stream.runIntoQueue(storedChanges, pending), {
        startImmediately: true,
      })
      const current = yield* get
      return Stream.concat(Stream.succeed(current), Stream.fromQueue(pending))
    }),
  )

  return SiteCommands.of({ get, update, changes })
})

export class SiteCommands extends Context.Service<
  SiteCommands,
  {
    /** Doesn't fail on a missing or broken saved list; see {@link siteCommandListOfStored}. */
    readonly get: Effect.Effect<SiteCommandList, BrowserApiError>
    /**
     * Saves `change` applied to the latest saved list, and returns the saved list. Concurrent calls
     * are applied one at a time.
     */
    update(
      change: (list: SiteCommandList) => SiteCommandList,
    ): Effect.Effect<SiteCommandList, BrowserApiError>
    /**
     * Emits the list as of subscribing first, then the new list whenever the saved one changes,
     * including saves from other pages.
     */
    readonly changes: Stream.Stream<SiteCommandList, BrowserApiError>
  }
>()("katip/site-commands/SiteCommands") {
  static readonly layer = Layer.effect(
    SiteCommands,
    Effect.gen(function* () {
      const storage = yield* Storage
      return yield* makeSiteCommands(storage.local)
    }),
  )
}
