import { Array, Context, Effect, Layer, Option } from "effect"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import type { WindowId } from "./ids"
import { type BrowserWindow, fromChromeWindow } from "./window"

export interface WindowCreateOptions {
  /** 省略時は新しいタブのページを 1 つ開く。 */
  readonly url?: string
  /** 省略時は `true`。 */
  readonly focused?: boolean
}

export interface WindowUpdateOptions {
  /** `false` にすると、重なり順で次のウィンドウにフォーカスが移る。 */
  readonly focused?: boolean
}

export class Windows extends Context.Service<
  Windows,
  {
    readonly getAll: Effect.Effect<ReadonlyArray<BrowserWindow>, BrowserApiError>
    get(windowId: WindowId): Effect.Effect<BrowserWindow, BrowserApiError>
    /** ウィンドウが 1 つも無ければ失敗する。 */
    readonly getLastFocused: Effect.Effect<BrowserWindow, BrowserApiError>
    create(options: WindowCreateOptions): Effect.Effect<BrowserWindow, BrowserApiError>
    update(
      windowId: WindowId,
      options: WindowUpdateOptions,
    ): Effect.Effect<BrowserWindow, BrowserApiError>
  }
>()("katip/platform/browser/Windows") {
  static readonly layer = Layer.succeed(
    Windows,
    Windows.of({
      getAll: Effect.map(
        callChrome("windows.getAll", () => chrome.windows.getAll()),
        (raws) => Array.getSomes(raws.map(fromChromeWindow)),
      ),
      get: Effect.fn("Windows.get")(function* (windowId) {
        const raw = yield* callChrome("windows.get", () => chrome.windows.get(windowId))
        return yield* requirePresent("windows.get", "the window has no id")(fromChromeWindow(raw))
      }),
      getLastFocused: Effect.flatMap(
        callChrome("windows.getLastFocused", () => chrome.windows.getLastFocused()),
        (raw) =>
          requirePresent("windows.getLastFocused", "the window has no id")(fromChromeWindow(raw)),
      ),
      create: Effect.fn("Windows.create")(function* (options) {
        const raw = yield* callChrome("windows.create", () =>
          chrome.windows.create({ url: options.url, focused: options.focused }),
        )
        return yield* requirePresent(
          "windows.create",
          "Chrome returned no window",
        )(Option.flatMap(Option.fromUndefinedOr(raw), fromChromeWindow))
      }),
      update: Effect.fn("Windows.update")(function* (windowId, options) {
        const raw = yield* callChrome("windows.update", () =>
          chrome.windows.update(windowId, { focused: options.focused }),
        )
        return yield* requirePresent(
          "windows.update",
          "the window has no id",
        )(fromChromeWindow(raw))
      }),
    }),
  )
}
