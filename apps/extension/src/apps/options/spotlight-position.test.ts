import { describe, expect, it } from "vitest"
import { draggedPosition, nudgedPosition } from "./spotlight-position"

const start = { x: 0.2, y: 0.6 }

describe("dragging Spotlight's position", () => {
  it("moves it by the share of the room it was dragged across", () => {
    expect(draggedPosition(start, { x: 0.1, y: -0.2 })).toStrictEqual({ x: 0.3, y: 0.4 })
  })

  it("keeps it inside the window", () => {
    expect(draggedPosition(start, { x: -1, y: 2 })).toStrictEqual({ x: 0, y: 1 })
  })

  it("snaps it to the center across, and to where it opens by default down, when dragged close", () => {
    expect(draggedPosition(start, { x: 0.28, y: -0.28 })).toStrictEqual({ x: 0.5, y: 0.3 })
  })

  it("snaps it to the edges when dragged close", () => {
    expect(draggedPosition({ x: 0.5, y: 0.5 }, { x: 0.48, y: -0.48 })).toStrictEqual({ x: 1, y: 0 })
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
