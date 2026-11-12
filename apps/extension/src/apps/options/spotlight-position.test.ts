import { describe, expect, it } from "vitest"
import { spotlightBoundsOver } from "#modules/spotlight"
import {
  draggedPlacement,
  nudgedPosition,
  spotlightOffsetOf,
  spotlightShareOf,
} from "./spotlight-position"

describe("Spotlight's share of the browser window", () => {
  it("is its size over the window's", () => {
    expect(spotlightShareOf({ width: 1280, height: 800 }, "Normal")).toStrictEqual({
      width: 0.5,
      height: 0.55,
      openingHeight: 0.55,
    })
  })

  it("opens a compact Spotlight with its search field alone, though it is placed by its full height", () => {
    expect(spotlightShareOf({ width: 1280, height: 800 }, "Compact")).toStrictEqual({
      width: 0.5,
      height: 0.55,
      openingHeight: 0.11,
    })
  })

  it("shrinks over a window too small for Spotlight, as Spotlight does when it opens there", () => {
    expect(spotlightShareOf({ width: 600, height: 400 }, "Large")).toStrictEqual({
      width: 0.92,
      height: 0.88,
      openingHeight: 0.88,
    })
  })
})

describe("where a position puts Spotlight's edges", () => {
  it("is where the window opens", () => {
    const browserWindow = { left: 0, top: 0, width: 1440, height: 900 }
    const position = { x: 0.25, y: 0.8 }
    const opened = spotlightBoundsOver(browserWindow, "Normal", position)

    const offset = spotlightOffsetOf(position, spotlightShareOf(browserWindow, "Normal"))

    expect(offset.left * browserWindow.width).toBeCloseTo(opened.left)
    expect(offset.top * browserWindow.height).toBeCloseTo(opened.top)
  })
})

describe("dragging Spotlight over the window", () => {
  // Spotlight 400 by 400 pixels, which leaves 600 pixels of room across and 400 down
  const area = { width: 1000, height: 800 }
  const spotlight = { width: 0.4, height: 0.5 }
  const start = { x: 0.2, y: 0.6 }

  it("moves it by the share of the room the pointer travelled, resting against nothing away from the guides", () => {
    expect(draggedPlacement(start, { x: 60, y: -80 }, area, spotlight)).toStrictEqual({
      position: { x: 0.3, y: 0.4 },
      guides: { x: null, y: null },
    })
  })

  it("puts Spotlight in the middle across when the drag ends near the center line", () => {
    expect(draggedPlacement(start, { x: 174, y: 0 }, area, spotlight)).toStrictEqual({
      position: { x: 0.5, y: 0.6 },
      guides: { x: { _tag: "Line", at: 0.5 }, y: null },
    })
  })

  it("centers Spotlight on a quarter line when the drag ends near it", () => {
    expect(draggedPlacement({ x: 0.05, y: 0.6 }, { x: 30, y: 0 }, area, spotlight)).toStrictEqual({
      position: { x: 0.083, y: 0.6 },
      guides: { x: { _tag: "Line", at: 0.25 }, y: null },
    })
  })

  it("puts Spotlight where it opens by default down when the drag ends near there", () => {
    expect(draggedPlacement(start, { x: 0, y: -112 }, area, spotlight)).toStrictEqual({
      position: { x: 0.2, y: 0.3 },
      guides: { x: null, y: { _tag: "Default" } },
    })
  })

  it("leaves Spotlight flush with the edges when dragged past them", () => {
    expect(draggedPlacement(start, { x: -1000, y: 1000 }, area, spotlight)).toStrictEqual({
      position: { x: 0, y: 1 },
      guides: { x: { _tag: "Line", at: 0 }, y: { _tag: "Line", at: 1 } },
    })
  })

  it("leaves Spotlight as it was across when it is as wide as the window", () => {
    expect(draggedPlacement(start, { x: 50, y: 0 }, area, { width: 1, height: 0.5 })).toStrictEqual(
      {
        position: start,
        guides: { x: null, y: null },
      },
    )
  })

  it("centers Spotlight on the same lines of the browser window as over a smaller area that stands for it", () => {
    const browserWindow = { left: 0, top: 0, width: 1440, height: 900 }
    const share = spotlightShareOf(browserWindow, "Normal")

    const { position } = draggedPlacement(
      { x: 0.5, y: 0.3 },
      { x: 290, y: 70 },
      { width: 1200, height: 760 },
      share,
    )
    const opened = spotlightBoundsOver(browserWindow, "Normal", position)

    expect([
      (opened.left + opened.width / 2) / browserWindow.width,
      (opened.top + opened.height / 2) / browserWindow.height,
    ]).toStrictEqual([0.75, 0.5])
  })
})

describe("moving Spotlight's position with the keyboard", () => {
  it("moves a little with an arrow key, and further with Shift", () => {
    expect([
      nudgedPosition({ x: 0.5, y: 0.3 }, "ArrowRight", false),
      nudgedPosition({ x: 0.5, y: 0.3 }, "ArrowDown", true),
    ]).toStrictEqual([
      { x: 0.52, y: 0.3 },
      { x: 0.5, y: 0.4 },
    ])
  })

  it("stops at the edges", () => {
    expect(nudgedPosition({ x: 0, y: 1 }, "ArrowLeft", true)).toStrictEqual({ x: 0, y: 1 })
  })

  it("ignores other keys", () => {
    expect(nudgedPosition({ x: 0.5, y: 0.3 }, "Enter", false)).toBeNull()
  })
})
