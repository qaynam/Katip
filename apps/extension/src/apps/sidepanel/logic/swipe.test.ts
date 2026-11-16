import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import {
  detectSwipe,
  downloadsPage,
  newSpacePage,
  spacePage,
  swipeDestination,
  type SidebarPage,
  type SwipeDirection,
} from "./swipe"

const longAgo = Number.POSITIVE_INFINITY

describe("detectSwipe", () => {
  it("goes back to the previous Space on a strong enough swipe to the left", () => {
    expect(Option.getOrNull(detectSwipe({ deltaX: -26, deltaY: 0 }, longAgo))).toBe("previous")
  })

  it("moves to the next Space on a strong enough swipe to the right", () => {
    expect(Option.getOrNull(detectSwipe({ deltaX: 26, deltaY: 3 }, longAgo))).toBe("next")
  })

  it("ignores weak movements of 25px or less horizontally", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 25, deltaY: 0 }, longAgo))).toBe(true)
  })

  it("ignores movements that are more vertical than horizontal as vertical scrolling", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 40, deltaY: -41 }, longAgo))).toBe(true)
  })

  it("doesn't switch again until 400ms after the last switch", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 80, deltaY: 0 }, 399))).toBe(true)
    expect(Option.isSome(detectSwipe({ deltaX: 80, deltaY: 0 }, 400))).toBe(true)
  })
})

describe("swipeDestination", () => {
  const spaces = ["a", "b", "c"].map((id) => ({ id: SpaceId.make(id) }))
  const destination = (current: SidebarPage, direction: SwipeDirection) =>
    Option.getOrNull(swipeDestination(spaces, current, direction))

  it("goes to the neighboring Space", () => {
    expect([
      destination(spacePage(SpaceId.make("b")), "next"),
      destination(spacePage(SpaceId.make("b")), "previous"),
    ]).toStrictEqual([spacePage(SpaceId.make("c")), spacePage(SpaceId.make("a"))])
  })

  it("goes to a new Space past the last Space rather than around to the first", () => {
    expect(destination(spacePage(SpaceId.make("c")), "next")).toStrictEqual(newSpacePage)
  })

  it("goes to Downloads past the first Space rather than around to the last", () => {
    expect(destination(spacePage(SpaceId.make("a")), "previous")).toStrictEqual(downloadsPage)
  })

  it("comes back to the last Space from a new Space and to the first from Downloads", () => {
    expect([
      destination(newSpacePage, "previous"),
      destination(downloadsPage, "next"),
    ]).toStrictEqual([spacePage(SpaceId.make("c")), spacePage(SpaceId.make("a"))])
  })

  it("has nowhere to go past Downloads or a new Space", () => {
    expect([
      destination(downloadsPage, "previous"),
      destination(newSpacePage, "next"),
    ]).toStrictEqual([null, null])
  })

  it("has nowhere to go from a Space that isn't in the list", () => {
    expect(destination(spacePage(SpaceId.make("missing")), "next")).toBeNull()
  })
})
