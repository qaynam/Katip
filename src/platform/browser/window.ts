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

export const BrowserWindow = Schema.Struct({
  id: WindowId,
  focused: Schema.Boolean,
  type: Schema.OptionFromNullOr(WindowType),
  state: Schema.OptionFromNullOr(WindowState),
  incognito: Schema.Boolean,
})
export type BrowserWindow = typeof BrowserWindow.Type

/** @returns ID を持たないウィンドウ（他端末のセッションなど）は `None`。 */
export const fromChromeWindow = (raw: chrome.windows.Window): Option.Option<BrowserWindow> =>
  Option.map(windowIdFrom(raw.id), (id) => ({
    id,
    focused: raw.focused,
    type: Option.fromNullishOr(raw.type),
    state: Option.fromNullishOr(raw.state),
    incognito: raw.incognito,
  }))
