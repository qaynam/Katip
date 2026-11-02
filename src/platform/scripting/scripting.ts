import { Context, Effect, Layer } from "effect"
import { BrowserApiError, type TabId } from "#platform/browser"

export class Scripting extends Context.Service<
  Scripting,
  {
    /**
     * Runs `func` once with `args` in the top frame of an open tab.
     *
     * @remarks
     * The function is sent as source text, so it cannot reach outer variables or imports, and
     * `args` must be JSON-serializable. Fails on pages the extension may not access: it needs a
     * host permission, or the temporary `activeTab` grant for that tab.
     */
    executeFunction<const Args extends ReadonlyArray<unknown>>(
      tabId: TabId,
      func: (...args: Args) => void,
      args: Args,
    ): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/scripting/Scripting") {
  static readonly layer = Layer.succeed(
    Scripting,
    Scripting.of({
      executeFunction: (tabId, func, args) =>
        Effect.asVoid(
          Effect.tryPromise({
            try: () =>
              chrome.scripting.executeScript<[...typeof args], unknown>({
                target: { tabId },
                func,
                args: [...args],
              }),
            catch: (cause) => new BrowserApiError({ api: "scripting.executeScript", cause }),
          }),
        ),
    }),
  )
}
