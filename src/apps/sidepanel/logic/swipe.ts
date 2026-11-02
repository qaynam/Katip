import { Array, Option, pipe } from "effect"
import type { SpaceId } from "#modules/space"

export type SwipeDirection = "previous" | "next"

export const SWIPE_THRESHOLD_PX = 25
export const SWIPE_COOLDOWN_MS = 400

export interface WheelDelta {
  readonly deltaX: number
  readonly deltaY: number
}

// Momentum scrolling fires many wheel events per swipe, so events during the cooldown are
// ignored to move only one Space at a time
export const detectSwipe = (
  delta: WheelDelta,
  msSinceLastSwipe: number,
): Option.Option<SwipeDirection> => {
  const isHorizontal = Math.abs(delta.deltaX) > Math.abs(delta.deltaY)
  const isStrongEnough = Math.abs(delta.deltaX) > SWIPE_THRESHOLD_PX
  const isCoolingDown = msSinceLastSwipe < SWIPE_COOLDOWN_MS
  return isHorizontal && isStrongEnough && !isCoolingDown
    ? Option.some(delta.deltaX < 0 ? "previous" : "next")
    : Option.none()
}

export const neighborSpaceId = (
  spaces: ReadonlyArray<{ readonly id: SpaceId }>,
  activeId: SpaceId,
  direction: SwipeDirection,
): Option.Option<SpaceId> =>
  pipe(
    Array.findFirstIndex(spaces, (space) => space.id === activeId),
    Option.filter(() => spaces.length > 1),
    Option.flatMap((index) => {
      const step = direction === "next" ? 1 : -1
      return Array.get(spaces, (index + step + spaces.length) % spaces.length)
    }),
    Option.map((space) => space.id),
  )
