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

/** 失敗を仕込める API の名前。live の {@link BrowserApiError} の `api` と同じ表記。 */
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

/** fake の各サービスが共有する状態と、イベントの配信先。 */
export interface FakeWorld {
  readonly browsing: Ref.Ref<BrowsingState>
  /** 状態の読み書きとイベントの発火を、1 つの API 呼び出しごとに直列にする。 */
  readonly lock: Semaphore.Semaphore
  readonly publish: (events: ReadonlyArray<BrowserEvent>) => Effect.Effect<void>
  readonly takeEmitted: Effect.Effect<ReadonlyArray<BrowserEvent>>
  readonly events: HeldStream<BrowserEvent>
  readonly connections: HeldStream<BrowserPort>
  /** 次の呼び出しで失敗させる API。仕込んだ順に、名前が一致した呼び出しが 1 回ずつ消費する。 */
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
 * Chrome API の 1 回の呼び出しとして `effect` を実行する。
 *
 * @remarks
 * 実物の API は Promise で答えるので、呼び出した処理はかならず一度ほかの処理に順番を譲る。
 * 同期的に答えると、読んでから書くまでに別の処理が割り込む競合をテストで再現できない。
 * {@link FakeWorld.failures} に仕込まれた失敗があれば、`effect` を実行せずに失敗する。
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

/** 1 つの API 呼び出しの中で、状態を書き換えながら発火するイベントを積む。 */
export interface BrowsingTx {
  readonly now: number
  readonly state: Effect.Effect<BrowsingState>
  readonly setState: (state: BrowsingState) => Effect.Effect<void>
  readonly emit: (event: BrowserEvent) => Effect.Effect<void>
  readonly reject: (message: string) => Effect.Effect<never, BrowserApiError>
}

/**
 * `body` を排他的に実行し、成功したら状態を確定してから積んだイベントを発火する。
 *
 * @remarks
 * 失敗したら状態もイベントも捨てる。Chrome のリスナーは操作が終わってから呼ばれるので、
 * イベントの購読者が API を呼び返しても、操作の途中の状態は見えない。
 * 確定する前に、条件を満たさなくなった分割ビューを解く。
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
