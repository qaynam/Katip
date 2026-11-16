import { Array, Option, pipe } from "effect"
import type { SpaceId } from "#modules/space"
import type { SwipeDirection } from "./swipe"

export type SpaceOrder = ReadonlyArray<{ readonly id: SpaceId }>

/** A side of the sidebar, for what slides in from it or out to it. */
export type Side = "left" | "right"

const indexOf = (spaces: SpaceOrder, id: SpaceId) =>
  Array.findFirstIndex(spaces, (space) => space.id === id)

const directionWithin = (
  spaces: SpaceOrder,
  from: SpaceId,
  to: SpaceId,
): Option.Option<SwipeDirection> =>
  pipe(
    Option.all([indexOf(spaces, from), indexOf(spaces, to)]),
    Option.filter(([fromIndex, toIndex]) => fromIndex !== toIndex),
    Option.map(([fromIndex, toIndex]) => (toIndex > fromIndex ? "next" : "previous")),
  )

/**
 * Whether going from one Space to another goes toward the next Spaces in the bar or the previous
 * ones. The order before the switch decides when the Space left behind has since been deleted;
 * toward the next ones when neither order has both Spaces.
 */
export const switchDirection = (
  previousSpaces: SpaceOrder,
  spaces: SpaceOrder,
  from: SpaceId,
  to: SpaceId,
): SwipeDirection =>
  pipe(
    directionWithin(spaces, from, to),
    Option.orElse(() => directionWithin(previousSpaces, from, to)),
    Option.getOrElse((): SwipeDirection => "next"),
  )

/** The side the Space switched to comes in from. The Space left behind goes out the other side. */
export const enteringSide = (direction: SwipeDirection): Side =>
  direction === "next" ? "right" : "left"

export const oppositeSide = (side: Side): Side => (side === "left" ? "right" : "left")
