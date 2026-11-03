import { Context, Effect, Layer, Ref } from "effect"
import { BrowserApiError, type TabId } from "#platform/browser"
import { Scripting } from "./scripting"

export interface FunctionExecution {
  readonly tabId: TabId
  /** Name of the function that ran. */
  readonly name: string
  readonly args: ReadonlyArray<unknown>
}

/**
 * For tests. Records the functions run in tabs without running them.
 * `FakeScripting.layer` provides this and {@link Scripting} sharing the same state.
 */
export class FakeScripting extends Context.Service<
  FakeScripting,
  {
    /** In the order they ran. */
    readonly functionExecutions: Effect.Effect<ReadonlyArray<FunctionExecution>>
    /** Makes the next attempt to run a function in this tab fail without running it. */
    failNextInjectionInto(tabId: TabId): Effect.Effect<void>
  }
>()("katip/platform/scripting/FakeScripting") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const failingTabs = yield* Ref.make<ReadonlySet<TabId>>(new Set())
      const functionExecutions = yield* Ref.make<ReadonlyArray<FunctionExecution>>([])

      const scripting = Scripting.of({
        executeFunction: (tabId, func, args) =>
          Effect.flatMap(Ref.get(failingTabs), (failing) =>
            failing.has(tabId)
              ? Effect.andThen(
                  Ref.update(failingTabs, (all) => new Set([...all].filter((id) => id !== tabId))),
                  Effect.fail(
                    new BrowserApiError({
                      api: "scripting.executeScript",
                      cause: new Error("Cannot access contents of the page"),
                    }),
                  ),
                )
              : Ref.update(functionExecutions, (all) => [...all, { tabId, name: func.name, args }]),
          ),
      })

      return Context.make(Scripting, scripting).pipe(
        Context.add(
          FakeScripting,
          FakeScripting.of({
            functionExecutions: Ref.get(functionExecutions),
            failNextInjectionInto: (tabId) =>
              Ref.update(failingTabs, (all) => new Set([...all, tabId])),
          }),
        ),
      )
    }),
  )
}
