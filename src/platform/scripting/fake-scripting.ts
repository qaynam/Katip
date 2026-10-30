import { Context, Effect, Layer, Ref } from "effect"
import { BrowserApiError, type TabId } from "#platform/browser"
import { type ContentScriptRegistration, Scripting } from "./scripting"

export interface ScriptInjection {
  readonly tabId: TabId
  readonly files: ReadonlyArray<string>
}

/**
 * テスト用。登録されたスクリプトと、タブへの注入を観察する。
 * `FakeScripting.layer` はこれと {@link Scripting} を、状態を共有させて提供する。
 * Chrome と同じく、登録済みの ID を登録し直したり、登録されていない ID を外したりすると失敗する。
 */
export class FakeScripting extends Context.Service<
  FakeScripting,
  {
    /** 登録した順。 */
    readonly registered: Effect.Effect<ReadonlyArray<ContentScriptRegistration>>
    /** 注入した順。 */
    readonly injections: Effect.Effect<ReadonlyArray<ScriptInjection>>
    /** 次にこのタブへ注入しようとしたとき、何もせずに失敗させる。 */
    failNextInjectionInto(tabId: TabId): Effect.Effect<void>
  }
>()("katip/platform/scripting/FakeScripting") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const registered = yield* Ref.make<ReadonlyArray<ContentScriptRegistration>>([])
      const injections = yield* Ref.make<ReadonlyArray<ScriptInjection>>([])
      const failingTabs = yield* Ref.make<ReadonlySet<TabId>>(new Set())

      const fail = (api: string, cause: string) =>
        Effect.fail(new BrowserApiError({ api, cause: new Error(cause) }))

      const idsOf = (scripts: ReadonlyArray<ContentScriptRegistration>) =>
        new Set(scripts.map((script) => script.id))

      const scripting = Scripting.of({
        registerContentScripts: (scripts) =>
          Effect.flatMap(Ref.get(registered), (current) =>
            scripts.some((script) => idsOf(current).has(script.id))
              ? fail("scripting.registerContentScripts", "Duplicate script ID")
              : Ref.set(registered, [...current, ...scripts]),
          ),
        updateContentScripts: (scripts) =>
          Effect.flatMap(Ref.get(registered), (current) =>
            scripts.every((script) => idsOf(current).has(script.id))
              ? Ref.set(
                  registered,
                  current.map((old) => scripts.find((script) => script.id === old.id) ?? old),
                )
              : fail("scripting.updateContentScripts", "Nonexistent script ID"),
          ),
        unregisterContentScripts: (ids) =>
          Effect.flatMap(Ref.get(registered), (current) =>
            ids.every((id) => idsOf(current).has(id))
              ? Ref.set(
                  registered,
                  current.filter((script) => !ids.includes(script.id)),
                )
              : fail("scripting.unregisterContentScripts", "Nonexistent script ID"),
          ),
        getRegisteredContentScripts: (ids) =>
          Effect.map(Ref.get(registered), (current) =>
            current.filter((script) => ids.includes(script.id)),
          ),
        executeScript: (tabId, files) =>
          Effect.flatMap(Ref.get(failingTabs), (failing) =>
            failing.has(tabId)
              ? Effect.andThen(
                  Ref.update(failingTabs, (all) => new Set([...all].filter((id) => id !== tabId))),
                  fail("scripting.executeScript", "Cannot access contents of the page"),
                )
              : Ref.update(injections, (all) => [...all, { tabId, files }]),
          ),
      })

      return Context.make(Scripting, scripting).pipe(
        Context.add(
          FakeScripting,
          FakeScripting.of({
            registered: Ref.get(registered),
            injections: Ref.get(injections),
            failNextInjectionInto: (tabId) =>
              Ref.update(failingTabs, (all) => new Set([...all, tabId])),
          }),
        ),
      )
    }),
  )
}
