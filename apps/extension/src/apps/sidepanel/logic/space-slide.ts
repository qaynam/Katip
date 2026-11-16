import { Array, Option, pipe } from "effect"
import type { SpaceId } from "#modules/space"
import type { SidebarPage, SwipeDirection } from "./swipe"

export type SpaceOrder = ReadonlyArray<{ readonly id: SpaceId }>

/** A side of the sidebar, for what slides in from it or out to it. */
export type Side = "left" | "right"

const positionIn = (spaces: SpaceOrder, page: SidebarPage): Option.Option<number> => {
  switch (page._tag) {
    case "Downloads":
      return Option.some(-1)
    case "Space":
      return Array.findFirstIndex(spaces, (space) => space.id === page.spaceId)
    case "NewSpace":
      return Option.some(spaces.length)
  }
}

const directionWithin = (
  spaces: SpaceOrder,
  from: SidebarPage,
  to: SidebarPage,
): Option.Option<SwipeDirection> =>
  pipe(
    Option.all([positionIn(spaces, from), positionIn(spaces, to)]),
    Option.filter(([fromIndex, toIndex]) => fromIndex !== toIndex),
    Option.map(([fromIndex, toIndex]) => (toIndex > fromIndex ? "next" : "previous")),
  )

const isCreatedFrom = (previousSpaces: SpaceOrder, from: SidebarPage, to: SidebarPage) =>
  from._tag === "NewSpace" && to._tag === "Space" && Option.isNone(positionIn(previousSpaces, to))

/**
 * Whether going from one page to another goes toward the next pages or the previous ones. The
 * order before the switch decides when the Space left behind has since been deleted. Neither, so
 * nothing moves, when the Space just created takes the place of the new Space being named, or when
 * neither order has both pages.
 */
export const switchDirection = (
  previousSpaces: SpaceOrder,
  spaces: SpaceOrder,
  from: SidebarPage,
  to: SidebarPage,
): Option.Option<SwipeDirection> =>
  isCreatedFrom(previousSpaces, from, to)
    ? Option.none()
    : pipe(
        directionWithin(spaces, from, to),
        Option.orElse(() => directionWithin(previousSpaces, from, to)),
      )

/** The side the page switched to comes in from. The page left behind goes out the other side. */
export const enteringSide = (direction: SwipeDirection): Side =>
  direction === "next" ? "right" : "left"

export const oppositeSide = (side: Side): Side => (side === "left" ? "right" : "left")
