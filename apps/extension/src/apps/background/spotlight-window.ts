import { Array, Effect, Option } from "effect"
import { spotlightBoundsOver } from "#modules/spotlight"
import { type BrowserTab, Tabs, type WindowId, Windows } from "#platform/browser"
import { callerWindowOfSpotlight, SPOTLIGHT_PAGE_PATH, spotlightPageUrl } from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { urlOf } from "./tab-admission"

const isSpotlightPage = (extensionOrigin: string) => (tab: BrowserTab) =>
  urlOf(tab).startsWith(new URL(SPOTLIGHT_PAGE_PATH, extensionOrigin).href)

/**
 * Opens Spotlight over the `callerWindowId` window.
 *
 * @remarks
 * If Spotlight is already open for that window, brings it to the front instead of opening another.
 * One open for a different window is closed, then opened again.
 * Never opens over a window without Spaces (popups and devtools).
 */
export const openSpotlight = Effect.fn("openSpotlight")(function* (callerWindowId: WindowId) {
  const windows = yield* Windows
  const { origin } = yield* ExtensionInfo
  const opened = Array.findFirst(yield* (yield* Tabs).query({}), isSpotlightPage(origin))
  if (Option.isSome(opened)) {
    const spotlight = opened.value
    const servesCaller =
      spotlight.windowId === callerWindowId ||
      Option.contains(callerWindowOfSpotlight(urlOf(spotlight)), callerWindowId)
    if (servesCaller) {
      yield* windows.update(spotlight.windowId, { focused: true })
      return
    }
    yield* windows.remove(spotlight.windowId)
  }
  const caller = yield* windows.get(callerWindowId)
  if (!Option.contains(caller.type, "normal")) return
  yield* windows.create({
    url: spotlightPageUrl(origin, callerWindowId),
    type: "popup",
    focused: true,
    ...Option.getOrElse(Option.map(caller.bounds, spotlightBoundsOver), () => ({})),
  })
})
