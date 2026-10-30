import { Option, Schema } from "effect"
import { windowIdFrom } from "./chrome-values"
import { WindowId } from "./ids"

export const WindowType = Schema.Literals(["normal", "popup", "panel", "app", "devtools"])
export type WindowType = typeof WindowType.Type

export const WindowState = Schema.Literals([
  "normal",
  "minimized",
  "maximized",
  "fullscreen",
  "locked-fullscreen",
])
export type WindowState = typeof WindowState.Type

/** 画面上の位置と大きさ。単位は CSS ピクセルで、原点は主画面の左上。 */
export const WindowBounds = Schema.Struct({
  left: Schema.Int,
  top: Schema.Int,
  width: Schema.Int,
  height: Schema.Int,
})
export type WindowBounds = typeof WindowBounds.Type

export const BrowserWindow = Schema.Struct({
  id: WindowId,
  focused: Schema.Boolean,
  type: Schema.OptionFromNullOr(WindowType),
  state: Schema.OptionFromNullOr(WindowState),
  incognito: Schema.Boolean,
  // Chrome が位置と大きさのどれか 1 つでも返さなければ None
  bounds: Schema.OptionFromNullOr(WindowBounds),
})
export type BrowserWindow = typeof BrowserWindow.Type

const boundsFrom = (raw: chrome.windows.Window): Option.Option<WindowBounds> =>
  Option.all({
    left: Option.fromNullishOr(raw.left),
    top: Option.fromNullishOr(raw.top),
    width: Option.fromNullishOr(raw.width),
    height: Option.fromNullishOr(raw.height),
  })

/** @returns ID を持たないウィンドウ（他端末のセッションなど）は `None`。 */
export const fromChromeWindow = (raw: chrome.windows.Window): Option.Option<BrowserWindow> =>
  Option.map(windowIdFrom(raw.id), (id) => ({
    id,
    focused: raw.focused,
    type: Option.fromNullishOr(raw.type),
    state: Option.fromNullishOr(raw.state),
    incognito: raw.incognito,
    bounds: boundsFrom(raw),
  }))
