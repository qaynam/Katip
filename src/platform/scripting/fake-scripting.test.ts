import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { TabId } from "#platform/browser"
import { FakeScripting } from "./fake-scripting"
import { type ContentScriptRegistration, Scripting } from "./scripting"

const script = (
  id: string,
  overrides: Partial<ContentScriptRegistration> = {},
): ContentScriptRegistration => ({
  id,
  js: ["page.js"],
  matches: ["*://*/*"],
  runAt: "document_start",
  allFrames: false,
  persistAcrossSessions: true,
  ...overrides,
})

describe("スクリプトの登録", () => {
  it.effect("登録したスクリプトだけが、ID を指定して取り出せる", () =>
    Effect.gen(function* () {
      const scripting = yield* Scripting
      yield* scripting.registerContentScripts([script("a"), script("b")])

      const found = yield* scripting.getRegisteredContentScripts(["b", "missing"])

      assert.deepStrictEqual(
        found.map((registered) => registered.id),
        ["b"],
      )
    }).pipe(Effect.provide(FakeScripting.layer)),
  )

  it.effect("登録済みの ID は登録し直せず、更新で置き換える", () =>
    Effect.gen(function* () {
      const scripting = yield* Scripting
      yield* scripting.registerContentScripts([script("a")])

      const again = yield* Effect.exit(scripting.registerContentScripts([script("a")]))
      yield* scripting.updateContentScripts([script("a", { allFrames: true })])

      assert.isTrue(Exit.isFailure(again))
      assert.deepStrictEqual(yield* (yield* FakeScripting).registered, [
        script("a", { allFrames: true }),
      ])
    }).pipe(Effect.provide(FakeScripting.layer)),
  )

  it.effect("登録されていない ID は外せない", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit((yield* Scripting).unregisterContentScripts(["missing"]))

      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(FakeScripting.layer)),
  )
})

describe("タブへの注入", () => {
  it.effect("失敗させたタブには一度だけ注入できず、次からは注入できる", () =>
    Effect.gen(function* () {
      const scripting = yield* Scripting
      const fake = yield* FakeScripting
      const tabId = TabId.make(7)
      yield* fake.failNextInjectionInto(tabId)

      const first = yield* Effect.exit(scripting.executeScript(tabId, ["page.js"]))
      yield* scripting.executeScript(tabId, ["page.js"])

      assert.isTrue(Exit.isFailure(first))
      assert.deepStrictEqual(yield* fake.injections, [{ tabId, files: ["page.js"] }])
    }).pipe(Effect.provide(FakeScripting.layer)),
  )
})
