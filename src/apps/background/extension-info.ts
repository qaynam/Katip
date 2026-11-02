import { Context, Effect, Layer } from "effect"
import { BrowserApiError } from "#platform/browser"

export class ExtensionInfo extends Context.Service<
  ExtensionInfo,
  {
    /** The origin of Katip's own pages, in the form `chrome-extension://<id>/`. */
    readonly origin: string
    /** The extension's version as written in the manifest. */
    readonly version: string
    readonly openOptionsPage: Effect.Effect<void, BrowserApiError>
  }
>()("katip/background/ExtensionInfo") {
  static readonly layer = Layer.sync(ExtensionInfo, () =>
    ExtensionInfo.of({
      origin: chrome.runtime.getURL(""),
      version: chrome.runtime.getManifest().version,
      openOptionsPage: Effect.tryPromise({
        try: () => chrome.runtime.openOptionsPage(),
        catch: (cause) => new BrowserApiError({ api: "runtime.openOptionsPage", cause }),
      }),
    }),
  )

  static readonly layerTest = Layer.succeed(
    ExtensionInfo,
    ExtensionInfo.of({
      origin: "chrome-extension://katip-test/",
      version: "0.0.0-test",
      openOptionsPage: Effect.void,
    }),
  )
}
