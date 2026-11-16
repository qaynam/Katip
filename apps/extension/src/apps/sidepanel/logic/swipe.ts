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

/** What the sidebar shows, as one of the pages a horizontal swipe moves through. */
export type SidebarPage =
  | { readonly _tag: "Downloads" }
  | { readonly _tag: "Space"; readonly spaceId: SpaceId }
  | { readonly _tag: "NewSpace" }

export const downloadsPage: SidebarPage = { _tag: "Downloads" }
export const newSpacePage: SidebarPage = { _tag: "NewSpace" }
export const spacePage = (spaceId: SpaceId): SidebarPage => ({ _tag: "Space", spaceId })

export const isSamePage = (a: SidebarPage, b: SidebarPage): boolean =>
  a._tag === b._tag && (a._tag !== "Space" || (b._tag === "Space" && a.spaceId === b.spaceId))

/**
 * The page a swipe goes to. Downloads come before the first Space and a new Space after the last;
 * past either of those, and from a page not among them, there is nowhere to go.
 */
export const swipeDestination = (
  spaces: ReadonlyArray<{ readonly id: SpaceId }>,
  current: SidebarPage,
  direction: SwipeDirection,
): Option.Option<SidebarPage> => {
  const pages = [downloadsPage, ...spaces.map((space) => spacePage(space.id)), newSpacePage]
  return pipe(
    Array.findFirstIndex(pages, (page) => isSamePage(page, current)),
    Option.flatMap((index) => Array.get(pages, index + (direction === "next" ? 1 : -1))),
  )
}
