import { Array, Effect, Option } from "effect"
import { SettingsRepository } from "#modules/settings"
import { SPOTLIGHT_LAYOUTS, SPOTLIGHT_SEARCH_HEIGHT, spotlightBoundsOver } from "#modules/spotlight"
import { type BrowserTab, Tabs, type WindowBounds, type WindowId, Windows } from "#platform/browser"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { callerWindowOfSpotlight, SPOTLIGHT_PAGE_PATH, spotlightPageUrl } from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { activeSpaceTheme } from "./spotlight-results"
import { urlOf } from "./tab-admission"

// The title bar's height differs between systems, which only the page can measure. It sets the
// height exactly once loaded; this keeps the window from opening visibly taller than that
const TITLE_BAR_ALLOWANCE = 28

const isSpotlightPage = (extensionOrigin: string) => (tab: BrowserTab) =>
  urlOf(tab).startsWith(new URL(SPOTLIGHT_PAGE_PATH, extensionOrigin).href)

/**
 * Opens Spotlight over the `callerWindowId` window, at the size and in the place chosen in the
 * settings.
 *
 * @param address - The active tab's address, to open Spotlight with it typed so as to edit it, as
 *   the address bar does. What's chosen then opens in that tab rather than a new one.
 *
 * @remarks
 * If Spotlight is already open for that window, brings it to the front instead of opening another,
 * unless an address is to be edited, which needs one opened with it. One open for a different
 * window is closed, then opened again.
 * Never opens over a window without Spaces (popups and devtools).
 * On macOS it opens behind the calling window, and the page brings it to the front once it has
 * drawn its first frame.
 */
export const openSpotlight = Effect.fn("openSpotlight")(function* (
  callerWindowId: WindowId,
  address: string | null = null,
) {
  const windows = yield* Windows
  const { origin } = yield* ExtensionInfo
  const opened = Array.findFirst(yield* (yield* Tabs).query({}), isSpotlightPage(origin))
  if (Option.isSome(opened)) {
    const spotlight = opened.value
    const servesCaller =
      spotlight.windowId === callerWindowId ||
      Option.contains(callerWindowOfSpotlight(urlOf(spotlight)), callerWindowId)
    if (servesCaller && address === null) {
      yield* windows.update(spotlight.windowId, { focused: true })
      return
    }
    yield* windows.remove(spotlight.windowId)
  }
  const caller = yield* windows.get(callerWindowId)
  if (!Option.contains(caller.type, "normal")) return
  const { spotlightSize, spotlightPosition, locale } = yield* (yield* SettingsRepository).get
  const boundsOver = (callerBounds: WindowBounds) => {
    const full = spotlightBoundsOver(callerBounds, spotlightSize, spotlightPosition)
    return SPOTLIGHT_LAYOUTS[spotlightSize].collapses
      ? { ...full, height: SPOTLIGHT_SEARCH_HEIGHT + TITLE_BAR_ALLOWANCE }
      : full
  }
  // Not opened in front on macOS: there a new window shows black until the page's first frame,
  // which flashes over a light theme, while one opened unfocused goes behind the focused window
  // and draws there unseen. Elsewhere an unfocused window still opens in front, black all the same
  const opensBehind = yield* (yield* KeyboardShortcuts).isMac.pipe(
    Effect.orElseSucceed(() => false),
  )
  yield* windows.create({
    url: spotlightPageUrl(origin, {
      callerWindowId,
      spaceTheme: yield* activeSpaceTheme(callerWindowId),
      size: spotlightSize,
      locale,
      address,
    }),
    type: "popup",
    focused: !opensBehind,
    ...Option.getOrElse(Option.map(caller.bounds, boundsOver), () => ({})),
  })
})
