import { describe, expect, it } from "vitest"
import { addHarmonyColor, colorAtPoint, pointOfColor, removeLastColor } from "./picker"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

const rounded = (color: ThemeColor) => ({
  hue: Math.round(color.hue),
  chroma: Math.round(color.chroma * 100) / 100,
})

describe("picker points and colors", () => {
  it("put hue 0 degrees to the right of the center and 90 degrees above it", () => {
    expect([colorAtPoint({ x: 1, y: 0 }), colorAtPoint({ x: 0, y: 1 })].map(rounded)).toStrictEqual(
      [
        { hue: 0, chroma: 1 },
        { hue: 90, chroma: 1 },
      ],
    )
  })

  it("take the distance from the center as the chroma", () => {
    expect(rounded(colorAtPoint({ x: 0, y: -0.5 }))).toStrictEqual({ hue: 270, chroma: 0.5 })
  })

  it("give a point outside the circle the edge color in the same direction", () => {
    expect(rounded(colorAtPoint({ x: 3, y: 0 }))).toStrictEqual({ hue: 0, chroma: 1 })
  })

  it("round-trip from a color to a point and back to the same color", () => {
    const color = { hue: 123, chroma: 0.42 }

    expect(rounded(colorAtPoint(pointOfColor(color)))).toStrictEqual(color)
  })
})

describe("adding and removing colors", () => {
  it("adding a color adds one of the same chroma, its hue shifted from the primary color", () => {
    const added = addHarmonyColor([{ hue: 90, chroma: 0.6 }])

    expect(added).toStrictEqual([
      { hue: 90, chroma: 0.6 },
      { hue: 130, chroma: 0.6 },
    ])
  })

  it("shifts the third color to the other side of the primary color", () => {
    const added = addHarmonyColor(addHarmonyColor([{ hue: 90, chroma: 0.6 }]))

    expect(added.map((c) => c.hue)).toStrictEqual([90, 130, 50])
  })

  it(`can't add more than ${MAX_THEME_COLORS} colors`, () => {
    const full = addHarmonyColor(addHarmonyColor([{ hue: 90, chroma: 0.6 }]))

    expect(addHarmonyColor(full)).toBe(full)
  })

  it("adding to a theme without colors adds a first color", () => {
    expect(addHarmonyColor([])).toHaveLength(1)
  })

  it("removes the last added color first and keeps the primary color", () => {
    const primary = { hue: 90, chroma: 0.6 }
    const colors = [primary, { hue: 130, chroma: 0.6 }]

    expect([removeLastColor(colors), removeLastColor([primary])]).toStrictEqual([
      [primary],
      [primary],
    ])
  })
})
