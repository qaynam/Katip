import { Array, Clock, Effect, Option, Ref, Semaphore } from "effect"
import {
  type Alarms,
  type Bookmarks,
  BrowserApiError,
  type BrowserEvent,
  type BrowserPort,
  type HeldStream,
  makeHeldStream,
  type StorageAreaName,
  type TabGroups,
  type Tabs,
  type WebSearch,
  type Windows,
} from "#platform/browser"
import { type BrowsingState, emptyBrowsingState } from "./browsing-state"
import { dissolveBrokenSplitViews } from "./browsing-steps"

type ApiNameOf<Service> = {
  readonly [K in keyof Service & string]: Service[K] extends boolean ? never : K
}[keyof Service & string]

/** Names of APIs that can be made to fail, spelled as `api` in the live {@link BrowserApiError}. */
export type FakeApiName =
  | `tabs.${ApiNameOf<Tabs["Service"]>}`
  | `tabGroups.${ApiNameOf<TabGroups["Service"]>}`
  | `windows.${ApiNameOf<Windows["Service"]>}`
  | `bookmarks.${ApiNameOf<Bookmarks["Service"]>}`
  | `storage.${StorageAreaName}.${"get" | "set" | "remove"}`
  | `alarms.${ApiNameOf<Alarms["Service"]>}`
  | `search.${ApiNameOf<WebSearch["Service"]>}`

interface InjectedFailure {
  readonly api: string
  readonly cause: unknown
}

/** The state shared by every fake service, and where its events go. */
export interface FakeWorld {
  readonly browsing: Ref.Ref<BrowsingState>
  /** Serializes state reads, writes and event emission per API call. */
  readonly lock: Semaphore.Semaphore
  readonly publish: (events: ReadonlyArray<BrowserEvent>) => Effect.Effect<void>
  readonly takeEmitted: Effect.Effect<ReadonlyArray<BrowserEvent>>
  readonly events: HeldStream<BrowserEvent>
  readonly connections: HeldStream<BrowserPort>
  /**
   * APIs to fail on their next call. Each entry is used up, in the order queued, by one call with a
   * matching name.
   */
  readonly failures: Ref.Ref<ReadonlyArray<InjectedFailure>>
}

export const makeFakeWorld: Effect.Effect<FakeWorld> = Effect.gen(function* () {
  const emitted = yield* Ref.make<ReadonlyArray<BrowserEvent>>([])
  const events = makeHeldStream<BrowserEvent>()
  return {
    browsing: yield* Ref.make(emptyBrowsingState),
    lock: yield* Semaphore.make(1),
    publish: (published) =>
      Effect.andThen(
        Ref.update(emitted, (log) => [...log, ...published]),
        Effect.sync(() => published.forEach((event) => events.push(event))),
      ),
    takeEmitted: Ref.getAndSet(emitted, []),
    events,
    connections: makeHeldStream<BrowserPort>(),
    failures: yield* Ref.make<ReadonlyArray<InjectedFailure>>([]),
  }
})

const takeInjectedFailure = (world: FakeWorld, api: string) =>
  Ref.modify(
    world.failures,
    (pending): readonly [Option.Option<InjectedFailure>, ReadonlyArray<InjectedFailure>] =>
      Option.match(
        Array.findFirstIndex(pending, (failure) => failure.api === api),
        {
          onNone: () => [Option.none(), pending],
          onSome: (index) => [Array.get(pending, index), Array.remove(pending, index)],
        },
      ),
  )

/**
 * Runs `effect` as one Chrome API call.
 *
 * @remarks
 * The real APIs answer with a Promise, so the caller always yields to other work once. Answering
 * synchronously would keep tests from reproducing races where something else runs between a read
 * and the write that follows it. If {@link FakeWorld.failures} holds a failure for this API, fails
 * without running `effect`.
 */
export const chromeCall = <A, E>(
  world: FakeWorld,
  api: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E | BrowserApiError> =>
  Effect.gen(function* () {
    yield* Effect.yieldNow
    const injected = yield* takeInjectedFailure(world, api)
    if (Option.isSome(injected)) {
      return yield* new BrowserApiError({ api, cause: injected.value.cause })
    }
    return yield* effect
  })

/** Within one API call, updates the state and queues the events to emit. */
export interface BrowsingTx {
  readonly now: number
  readonly state: Effect.Effect<BrowsingState>
  readonly setState: (state: BrowsingState) => Effect.Effect<void>
  readonly emit: (event: BrowserEvent) => Effect.Effect<void>
  readonly reject: (message: string) => Effect.Effect<never, BrowserApiError>
}

/**
 * Runs `body` exclusively; on success, commits the state and then emits the queued events.
 *
 * @remarks
 * On failure, both the state and the events are discarded. Chrome calls listeners after an
 * operation finishes, so a subscriber that calls back into the API never sees a half-done state.
 * Before committing, dissolves split views that no longer meet their conditions.
 */
export const transact = <A, E>(
  world: FakeWorld,
  api: string,
  body: (tx: BrowsingTx) => Effect.Effect<A, E>,
): Effect.Effect<A, E | BrowserApiError> =>
  chromeCall(
    world,
    api,
    Semaphore.withPermits(
      world.lock,
      1,
    )(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const draft = yield* Ref.make(yield* Ref.get(world.browsing))
        const pending = yield* Ref.make<ReadonlyArray<BrowserEvent>>([])
        const tx: BrowsingTx = {
          now,
          state: Ref.get(draft),
          setState: (state) => Ref.set(draft, state),
          emit: (event) => Ref.update(pending, (events) => [...events, event]),
          reject: (message) => Effect.fail(new BrowserApiError({ api, cause: new Error(message) })),
        }
        const result = yield* body(tx)
        yield* dissolveBrokenSplitViews(tx)
        yield* Ref.set(world.browsing, yield* Ref.get(draft))
        yield* world.publish(yield* Ref.get(pending))
        return result
      }),
    ),
  )
