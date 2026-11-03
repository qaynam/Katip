import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { detectSwipe, neighborSpaceId } from "./swipe"

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

describe("neighborSpaceId", () => {
  const spaces = ["a", "b", "c"].map((id) => ({ id: SpaceId.make(id) }))
  const neighbor = (activeId: string, direction: "previous" | "next") =>
    Option.getOrNull(neighborSpaceId(spaces, SpaceId.make(activeId), direction))

  it("returns the neighboring Space", () => {
    expect(neighbor("b", "next")).toBe("c")
    expect(neighbor("b", "previous")).toBe("a")
  })

  it("wraps around to the other end at either end", () => {
    expect(neighbor("c", "next")).toBe("a")
    expect(neighbor("a", "previous")).toBe("c")
  })

  it("has nowhere to switch to with only one Space", () => {
    const only = [{ id: SpaceId.make("a") }]

    expect(Option.isNone(neighborSpaceId(only, SpaceId.make("a"), "next"))).toBe(true)
  })

  it("has nowhere to switch to when the active Space isn't in the list", () => {
    expect(neighbor("missing", "next")).toBeNull()
  })
})
