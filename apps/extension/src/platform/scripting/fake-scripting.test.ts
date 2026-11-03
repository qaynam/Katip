import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { TabId } from "#platform/browser"
import { FakeScripting } from "./fake-scripting"
import { Scripting } from "./scripting"

describe("running a function in a tab", () => {
  const greet = (name: string) => void name

  it.effect("records the function's name and arguments in the order they ran", () =>
    Effect.gen(function* () {
      const scripting = yield* Scripting
      const tabId = TabId.make(7)

      yield* scripting.executeFunction(tabId, greet, ["Katip"])

      assert.deepStrictEqual(yield* (yield* FakeScripting).functionExecutions, [
        { tabId, name: "greet", args: ["Katip"] },
      ])
    }).pipe(Effect.provide(FakeScripting.layer)),
  )

  it.effect("fails only the next run in a tab made to fail", () =>
    Effect.gen(function* () {
      const scripting = yield* Scripting
      const fake = yield* FakeScripting
      const tabId = TabId.make(7)
      yield* fake.failNextInjectionInto(tabId)

      const first = yield* Effect.exit(scripting.executeFunction(tabId, greet, ["a"]))
      yield* scripting.executeFunction(tabId, greet, ["b"])

      assert.isTrue(Exit.isFailure(first))
      assert.deepStrictEqual(
        (yield* fake.functionExecutions).map(({ args }) => args),
        [["b"]],
      )
    }).pipe(Effect.provide(FakeScripting.layer)),
  )
})
