import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { newSpacePage, spacePage } from "../logic/swipe"
import { SpaceSlide } from "./space-slide"

const spaces = ["a", "b", "c"].map((id) => ({ id: SpaceId.make(id) }))
const space = (id: string) => spacePage(SpaceId.make(id))

describe("SpaceSlide", () => {
  it("brings a later Space in from the right and sends the shown one out to the left", () => {
    const slide = new SpaceSlide(spaces, space("a"))

    slide.follow(spaces, space("b"))

    expect([slide.entersFrom, slide.leavesTo]).toStrictEqual(["right", "left"])
  })

  it("brings an earlier Space in from the left", () => {
    const slide = new SpaceSlide(spaces, space("c"))

    slide.follow(spaces, space("a"))

    expect(slide.entersFrom).toBe("left")
  })

  it("keeps its direction while the same Space stays shown", () => {
    const slide = new SpaceSlide(spaces, space("c"))
    slide.follow(spaces, space("a"))

    slide.follow([...spaces].reverse(), space("a"))

    expect(slide.entersFrom).toBe("left")
  })

  it("lets the Space just created take the place of the new Space being named without moving", () => {
    const slide = new SpaceSlide(spaces, space("c"))
    slide.follow(spaces, newSpacePage)
    const withCreated = [...spaces, { id: SpaceId.make("d") }]

    slide.follow(withCreated, space("d"))

    expect([slide.entersFrom, slide.leavesTo]).toStrictEqual([null, null])
  })
})
