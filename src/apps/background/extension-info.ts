import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"

export class ExtensionInfo extends Context.Service<
  ExtensionInfo,
  {
    /** `chrome-extension://<id>/` の形。自拡張のページを Space に入れないために使う。 */
    readonly origin: string
    readonly openOptionsPage: Effect.Effect<void, BrowserApiError>
  }
>()("katip/background/ExtensionInfo") {
  static readonly layer = Layer.sync(ExtensionInfo, () =>
    ExtensionInfo.of({
      origin: chrome.runtime.getURL(""),
      openOptionsPage: Effect.tryPromise({
        try: () => chrome.runtime.openOptionsPage(),
        catch: (cause) => new BrowserApiError({ api: "runtime.openOptionsPage", cause }),
      }),
    }),
  )

  static readonly layerTest = Layer.succeed(
    ExtensionInfo,
    ExtensionInfo.of({ origin: "chrome-extension://katip-test/", openOptionsPage: Effect.void }),
  )
}
