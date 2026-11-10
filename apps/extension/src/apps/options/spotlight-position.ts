import { DEFAULT_SPOTLIGHT_POSITION, type SpotlightPosition } from "#modules/spotlight"

// Where a drag comes to rest when it ends close by: the edges, the middle across, and the place
// Spotlight opens by default down
const SNAP_TARGETS = {
  x: [0, DEFAULT_SPOTLIGHT_POSITION.x, 1],
  y: [0, DEFAULT_SPOTLIGHT_POSITION.y, 1],
}
const SNAP_DISTANCE = 0.03

const clamped = (value: number) => Math.min(Math.max(value, 0), 1)

// Rounded so that a position saved is a tidy number rather than the leftovers of pointer math
const rounded = (value: number) => Math.round(value * 1000) / 1000

const snapped = (value: number, targets: ReadonlyArray<number>) =>
  targets.find((target) => Math.abs(target - value) < SNAP_DISTANCE) ?? value

/**
 * The position after a drag that moved Spotlight by `delta`, each a share of the room around
 * Spotlight on that axis.
 */
export const draggedPosition = (
  start: SpotlightPosition,
  delta: { readonly x: number; readonly y: number },
): SpotlightPosition => ({
  x: rounded(snapped(clamped(start.x + delta.x), SNAP_TARGETS.x)),
  y: rounded(snapped(clamped(start.y + delta.y), SNAP_TARGETS.y)),
})

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
