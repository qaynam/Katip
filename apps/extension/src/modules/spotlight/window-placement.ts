import type { WindowBounds } from "#platform/browser"
import { SPOTLIGHT_LAYOUTS, type SpotlightSize } from "./spotlight-size"

const MINIMUM = { width: 360, height: 240 }
const MARGIN = 24
// The share of the free height that goes above the window. Slightly above center rather than
// centered, so the eye lands on the search field without moving
const SPACE_ABOVE_RATIO = 0.3

const fit = (available: number, preferred: number, minimum: number) =>
  Math.max(Math.min(preferred, available - MARGIN * 2), minimum)

/**
 * The position and size of a Spotlight window laid over `caller`: centered horizontally, and above
 * center vertically.
 */
export const spotlightBoundsOver = (caller: WindowBounds, size: SpotlightSize): WindowBounds => {
  const preferred = SPOTLIGHT_LAYOUTS[size].window
  const width = fit(caller.width, preferred.width, MINIMUM.width)
  const height = fit(caller.height, preferred.height, MINIMUM.height)
  return {
    left: caller.left + Math.round((caller.width - width) / 2),
    top: caller.top + Math.max(Math.round((caller.height - height) * SPACE_ABOVE_RATIO), 0),
    width,
    height,
  }
}
