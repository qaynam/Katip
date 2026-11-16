import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { SpaceSlide } from "./space-slide"

const spaces = ["a", "b", "c"].map((id) => ({ id: SpaceId.make(id) }))

describe("SpaceSlide", () => {
  it("brings a later Space in from the right and sends the shown one out to the left", () => {
    const slide = new SpaceSlide(spaces, SpaceId.make("a"))

    slide.follow(spaces, SpaceId.make("b"))

    expect([slide.entersFrom, slide.leavesTo]).toStrictEqual(["right", "left"])
  })

  it("brings an earlier Space in from the left", () => {
    const slide = new SpaceSlide(spaces, SpaceId.make("c"))

    slide.follow(spaces, SpaceId.make("a"))

    expect(slide.entersFrom).toBe("left")
  })

  it("slides the way of a swipe that wrapped around past the last Space", () => {
    const slide = new SpaceSlide(spaces, SpaceId.make("c"))

    slide.expectSwipe(SpaceId.make("a"), "next")
    slide.follow(spaces, SpaceId.make("a"))

    expect(slide.entersFrom).toBe("right")
  })

  it("goes back to the Space order once the swiped-to Space has been shown", () => {
    const slide = new SpaceSlide(spaces, SpaceId.make("c"))
    slide.expectSwipe(SpaceId.make("a"), "next")
    slide.follow(spaces, SpaceId.make("a"))

    slide.follow(spaces, SpaceId.make("c"))
    slide.follow(spaces, SpaceId.make("a"))

    expect(slide.entersFrom).toBe("left")
  })

  it("keeps its direction while the same Space stays shown", () => {
    const slide = new SpaceSlide(spaces, SpaceId.make("c"))
    slide.follow(spaces, SpaceId.make("a"))

    slide.follow([...spaces].reverse(), SpaceId.make("a"))

    expect(slide.entersFrom).toBe("left")
  })
})
