import { Context, Effect, Layer, Ref, Stream } from "effect"
import { type BrowserEvent, BrowserEvents, Tabs } from "#platform/browser"

const QUIET_PERIOD = "30 millis"

/** What differs between the environments that run contract scenarios (real Chrome or the fake). */
export class ContractRig extends Context.Service<
  ContractRig,
  {
    /**
     * Takes the browser events received since the previous take, in arrival order.
     * Must include every event caused by API calls that have already completed.
     */
    readonly takeEvents: Effect.Effect<ReadonlyArray<BrowserEvent>>
  }
>()("katip/platform/browser-contract/ContractRig") {
  /** Buffers real Chrome events from the moment the layer subscribes. */
  static readonly live = Layer.effect(
    ContractRig,
    Effect.gen(function* () {
      const tabs = yield* Tabs
      const received = yield* Ref.make<ReadonlyArray<BrowserEvent>>([])
      yield* (yield* BrowserEvents).events.pipe(
        Stream.runForEach((event) => Ref.update(received, (log) => [...log, event])),
        Effect.forkScoped,
      )
      // Events were observed to arrive before the response of the call that caused them, but
      // relying on that alone would count a late event toward the next step. Round-trip and
      // wait until no more events arrive
      const settle: Effect.Effect<void> = Effect.gen(function* () {
        const before = (yield* Ref.get(received)).length
        yield* Effect.ignore(tabs.query({}))
        yield* Effect.sleep(QUIET_PERIOD)
        if ((yield* Ref.get(received)).length !== before) yield* settle
      })
      return ContractRig.of({ takeEvents: Effect.andThen(settle, Ref.getAndSet(received, [])) })
    }),
  )
}
