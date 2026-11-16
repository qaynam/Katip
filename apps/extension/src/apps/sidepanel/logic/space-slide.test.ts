import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { switchDirection } from "./space-slide"

const order = (...ids: ReadonlyArray<string>) => ids.map((id) => ({ id: SpaceId.make(id) }))
const id = SpaceId.make

describe("switchDirection", () => {
  it("goes toward the next Spaces when switching to one further along the bar", () => {
    expect(switchDirection(order("a", "b", "c"), order("a", "b", "c"), id("a"), id("c"))).toBe(
      "next",
    )
  })

  it("goes toward the previous Spaces when switching to one earlier in the bar", () => {
    expect(switchDirection(order("a", "b", "c"), order("a", "b", "c"), id("c"), id("b"))).toBe(
      "previous",
    )
  })

  it("follows the order before the switch when the Space left behind was deleted", () => {
    expect(switchDirection(order("a", "b", "c"), order("a", "c"), id("b"), id("a"))).toBe(
      "previous",
    )
  })

  it("goes toward the next Spaces for a Space just created at the end", () => {
    expect(switchDirection(order("a", "b"), order("a", "b", "c"), id("a"), id("c"))).toBe("next")
  })
})
