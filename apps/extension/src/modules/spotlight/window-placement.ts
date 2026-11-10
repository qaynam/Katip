import type { WindowBounds } from "#platform/browser"
import { SPOTLIGHT_LAYOUTS, type SpotlightPosition, type SpotlightSize } from "./spotlight-size"

const MINIMUM = { width: 360, height: 240 }
const MARGIN = 24

const fit = (available: number, preferred: number, minimum: number) =>
  Math.max(Math.min(preferred, available - MARGIN * 2), minimum)

/**
 * The position and size of a Spotlight window laid over `caller`, opened out to its full height
 * even for a compact Spotlight. `position` shares out the room left around it.
 */
export const spotlightBoundsOver = (
  caller: WindowBounds,
  size: SpotlightSize,
  position: SpotlightPosition,
): WindowBounds => {
  const preferred = SPOTLIGHT_LAYOUTS[size].window
  const width = fit(caller.width, preferred.width, MINIMUM.width)
  const height = fit(caller.height, preferred.height, MINIMUM.height)
  return {
    left: caller.left + Math.round((caller.width - width) * position.x),
    top: caller.top + Math.max(Math.round((caller.height - height) * position.y), 0),
    width,
    height,
  }
}
