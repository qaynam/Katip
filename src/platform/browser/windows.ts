import { Array, Context, Effect, Layer, Option } from "effect"
import { type BrowserApiError, callChrome, requirePresent } from "./browser-api-error"
import type { WindowId } from "./ids"
import { type BrowserWindow, fromChromeWindow } from "./window"

export interface WindowCreateOptions {
  /** Omitted, the window opens one New Tab page. */
  readonly url?: string
  /** Defaults to `true`. */
  readonly focused?: boolean
  /**
   * `popup` is a single-page window with no tab strip and no address bar. Defaults to `normal`.
   */
  readonly type?: "normal" | "popup"
  /** Position and size in CSS pixels; Chrome picks any value left out. */
  readonly left?: number
  readonly top?: number
  readonly width?: number
  readonly height?: number
}

export interface WindowUpdateOptions {
  /** `false` moves focus to the next window in stacking order. */
  readonly focused?: boolean
}

export class Windows extends Context.Service<
  Windows,
  {
    readonly getAll: Effect.Effect<ReadonlyArray<BrowserWindow>, BrowserApiError>
    get(windowId: WindowId): Effect.Effect<BrowserWindow, BrowserApiError>
    /** Fails when there is no window at all. */
    readonly getLastFocused: Effect.Effect<BrowserWindow, BrowserApiError>
    create(options: WindowCreateOptions): Effect.Effect<BrowserWindow, BrowserApiError>
    update(
      windowId: WindowId,
      options: WindowUpdateOptions,
    ): Effect.Effect<BrowserWindow, BrowserApiError>
    /**
     * Closes the window with its tabs, from the right, with `isWindowClosing: true`.
     *
     * @remarks
     * Before the tabs are removed, split views, groups and pinning are released, and the events for
     * those changes arrive first.
     */
    remove(windowId: WindowId): Effect.Effect<void, BrowserApiError>
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
          chrome.windows.create({
            url: options.url,
            focused: options.focused,
            type: options.type,
            left: options.left,
            top: options.top,
            width: options.width,
            height: options.height,
          }),
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
      remove: (windowId) => callChrome("windows.remove", () => chrome.windows.remove(windowId)),
    }),
  )
}
