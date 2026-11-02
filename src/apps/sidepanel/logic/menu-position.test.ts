import { describe, expect, it } from "vitest"
import { fitMenuPosition, pointRect } from "./menu-position"

const viewport = { width: 360, height: 600 }
const menu = { width: 200, height: 160 }

describe("Opening a menu where the user right-clicked", () => {
  it("opens with its top-left corner at the click when it fits", () => {
    expect(fitMenuPosition(pointRect({ x: 40, y: 100 }), menu, viewport)).toStrictEqual({
      x: 40,
      y: 100,
    })
  })

  it("opens to the left of the click when it would overflow on the right", () => {
    expect(fitMenuPosition(pointRect({ x: 300, y: 100 }), menu, viewport)).toStrictEqual({
      x: 100,
      y: 100,
    })
  })

  it("opens above the click when it would overflow at the bottom", () => {
    expect(fitMenuPosition(pointRect({ x: 40, y: 550 }), menu, viewport)).toStrictEqual({
      x: 40,
      y: 390,
    })
  })

  it("aligns to the right margin when it fits on neither side", () => {
    const wide = { width: 300, height: 160 }

    expect(fitMenuPosition(pointRect({ x: 200, y: 100 }), wide, viewport).x).toBe(52)
  })

  it("aligns to the top-left margin when the menu is larger than the viewport", () => {
    const huge = { width: 400, height: 700 }

    expect(fitMenuPosition(pointRect({ x: 200, y: 300 }), huge, viewport)).toStrictEqual({
      x: 8,
      y: 8,
    })
  })
})

describe("Opening a menu below a button", () => {
  const button = { left: 320, top: 40, right: 344, bottom: 64 }

  it("aligns the menu's right edge with the button's when it would overflow on the right", () => {
    expect(fitMenuPosition(button, menu, viewport)).toStrictEqual({ x: 144, y: 64 })
  })

  it("opens above the button when it would overflow at the bottom", () => {
    const lowButton = { left: 20, top: 500, right: 44, bottom: 524 }

    expect(fitMenuPosition(lowButton, menu, viewport)).toStrictEqual({ x: 20, y: 340 })
  })
})
