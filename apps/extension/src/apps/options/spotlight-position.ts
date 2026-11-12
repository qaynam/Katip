import {
  DEFAULT_SPOTLIGHT_POSITION,
  SPOTLIGHT_LAYOUTS,
  SPOTLIGHT_SEARCH_HEIGHT,
  type SpotlightPosition,
  type SpotlightSize,
  spotlightBoundsOver,
} from "#modules/spotlight"

export interface Extent {
  readonly width: number
  readonly height: number
}

/** The height of Spotlight's title bar as pictures draw it. The real one differs by system. */
export const TITLE_BAR_HEIGHT = 28

/** Spotlight's size as shares of the width and height of the browser window it opens over. */
export interface SpotlightShare extends Extent {
  /**
   * Of the height, how much shows as Spotlight opens: the search field alone for a compact one.
   * The room around Spotlight is shared out from its full height all the same.
   */
  readonly openingHeight: number
}

/** The lines of the grid drawn over the browser window, as shares of its width and height. */
export const GRID_LINES = [0.25, 0.5, 0.75] as const

/** How near a drag must bring Spotlight to a guide, in CSS pixels, for it to come to rest there. */
const SNAP_DISTANCE = 12

const clamped = (value: number) => Math.min(Math.max(value, 0), 1)

// Rounded so that a position saved is a tidy number rather than the leftovers of pointer math
const rounded = (value: number) => Math.round(value * 1000) / 1000

/** Spotlight's share of `browserWindow`, shrunk to fit as it is when it opens over a small one. */
export const spotlightShareOf = (browserWindow: Extent, size: SpotlightSize): SpotlightShare => {
  const opened = spotlightBoundsOver(
    { left: 0, top: 0, ...browserWindow },
    size,
    DEFAULT_SPOTLIGHT_POSITION,
  )
  const openingHeight = SPOTLIGHT_LAYOUTS[size].collapses
    ? Math.min(TITLE_BAR_HEIGHT + SPOTLIGHT_SEARCH_HEIGHT, opened.height)
    : opened.height
  return {
    width: opened.width / browserWindow.width,
    height: opened.height / browserWindow.height,
    openingHeight: openingHeight / browserWindow.height,
  }
}

/**
 * Where Spotlight's left and top edges are at `position`, as shares of the browser window's width
 * and height.
 */
export const spotlightOffsetOf = (
  position: SpotlightPosition,
  share: Extent,
): { readonly left: number; readonly top: number } => ({
  left: (1 - share.width) * position.x,
  top: Math.max((1 - share.height) * position.y, 0),
})

/** What a dragged Spotlight came to rest against on one axis. */
export type Guide =
  /**
   * A line `at` a share of the window's width or height: a grid line Spotlight is centered on, or
   * at 0 or 1, the edge it is flush with.
   */
  | { readonly _tag: "Line"; readonly at: number }
  /** Where Spotlight opens by default. */
  | { readonly _tag: "Default" }

export interface Placement {
  readonly position: SpotlightPosition
  /** Null on an axis where Spotlight rests against nothing. */
  readonly guides: { readonly x: Guide | null; readonly y: Guide | null }
}

interface Axis {
  /** Of the area Spotlight is dragged over, in CSS pixels. */
  readonly length: number
  /** Of Spotlight, in CSS pixels. */
  readonly extent: number
  readonly preferred: number
}

interface Target {
  readonly share: number
  readonly guide: Guide
}

// Edges first, so that where a grid line would put Spotlight flush with an edge, the edge lights up.
// A line Spotlight is too large to be centered on gives a share outside 0 to 1, always farther from
// a dragged position than the nearer edge is
const targetsAlong = ({ length, extent, preferred }: Axis): ReadonlyArray<Target> => [
  { share: 0, guide: { _tag: "Line", at: 0 } },
  { share: 1, guide: { _tag: "Line", at: 1 } },
  ...GRID_LINES.map((line) => ({
    share: (line * length - extent / 2) / (length - extent),
    guide: { _tag: "Line", at: line } as const,
  })),
  { share: preferred, guide: { _tag: "Default" } },
]

const placedAlong = (axis: Axis, start: number, moved: number) => {
  const room = axis.length - axis.extent
  if (room <= 0) return { share: start, guide: null }
  const free = clamped(start + moved / room)
  const distanceTo = (target: Target) => Math.abs(target.share - free) * room
  const nearest = targetsAlong(axis).reduce((best, target) =>
    distanceTo(target) < distanceTo(best) ? target : best,
  )
  return distanceTo(nearest) < SNAP_DISTANCE
    ? { share: rounded(nearest.share), guide: nearest.guide }
    : { share: rounded(free), guide: null }
}

/**
 * Where Spotlight comes to rest after a drag from `start` that moved the pointer by `moved`.
 *
 * @param area - The size of what stands for the browser window, in CSS pixels.
 * @param spotlight - Spotlight's width and full height as shares of `area`'s.
 */
export const draggedPlacement = (
  start: SpotlightPosition,
  moved: { readonly x: number; readonly y: number },
  area: Extent,
  spotlight: Extent,
): Placement => {
  const across = placedAlong(
    {
      length: area.width,
      extent: area.width * spotlight.width,
      preferred: DEFAULT_SPOTLIGHT_POSITION.x,
    },
    start.x,
    moved.x,
  )
  const down = placedAlong(
    {
      length: area.height,
      extent: area.height * spotlight.height,
      preferred: DEFAULT_SPOTLIGHT_POSITION.y,
    },
    start.y,
    moved.y,
  )
  return {
    position: { x: across.share, y: down.share },
    guides: { x: across.guide, y: down.guide },
  }
}

const STEPS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

/** The position after an arrow key, or null for any other key. */
export const nudgedPosition = (
  position: SpotlightPosition,
  key: string,
  isLargeStep: boolean,
): SpotlightPosition | null => {
  const step = STEPS[key]
  if (step === undefined) return null
  const distance = isLargeStep ? 0.1 : 0.02
  return {
    x: rounded(clamped(position.x + step.x * distance)),
    y: rounded(clamped(position.y + step.y * distance)),
  }
}
