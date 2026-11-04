import { describe, expect, it } from "vitest"
import { addHarmonyColor, colorAtPoint, moveColor, pointOfColor, removeLastColor } from "./picker"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

const rounded = (color: ThemeColor) => ({
  hue: Math.round(color.hue),
  chroma: Math.round(color.chroma * 100) / 100,
})

describe("picker points and colors", () => {
  it("put red's hue to the right of the center, and run hues clockwise from there", () => {
    const right = colorAtPoint({ x: 1, y: 0 })
    const below = colorAtPoint({ x: 0, y: -1 })
    const left = colorAtPoint({ x: -1, y: 0 })

    expect([right, below, left].map(rounded)).toStrictEqual([
      { hue: 29, chroma: 1 },
      { hue: 119, chroma: 1 },
      { hue: 209, chroma: 1 },
    ])
  })

  it("take the distance from the center as the chroma", () => {
    expect(rounded(colorAtPoint({ x: 0.5, y: 0 })).chroma).toBe(0.5)
  })

  it("give a point outside the circle the edge color in the same direction", () => {
    expect(rounded(colorAtPoint({ x: 3, y: 0 }))).toStrictEqual(
      rounded(colorAtPoint({ x: 1, y: 0 })),
    )
  })

  it("round-trip from a color to a point and back to the same color", () => {
    const color = { hue: 123, chroma: 0.42 }

    expect(rounded(colorAtPoint(pointOfColor(color)))).toStrictEqual(color)
  })
})

describe("moving a color", () => {
  const harmony: ReadonlyArray<ThemeColor> = [
    { hue: 100, chroma: 0.5 },
    { hue: 140, chroma: 0.5 },
    { hue: 60, chroma: 0.5 },
  ]

  it("turns the other colors with the primary color, keeping their hue offsets", () => {
    const moved = moveColor(harmony, 0, { hue: 200, chroma: 0.5 })

    expect(moved.map(rounded).map((color) => color.hue)).toStrictEqual([200, 240, 160])
  })

  it("turns the colors the short way round when the primary color crosses hue 0", () => {
    const moved = moveColor(harmony, 0, { hue: 350, chroma: 0.5 })

    expect(moved.map(rounded).map((color) => color.hue)).toStrictEqual([350, 30, 310])
  })

  it("gives every color the chroma of the moved one", () => {
    const moved = moveColor(harmony, 2, { hue: 60, chroma: 0.8 })

    expect(moved.map((color) => color.chroma)).toStrictEqual([0.8, 0.8, 0.8])
  })

  it("spreads the third color to mirror the second when the second moves, keeping the primary color's hue", () => {
    const moved = moveColor(harmony, 1, { hue: 170, chroma: 0.5 })

    expect(moved.map(rounded).map((color) => color.hue)).toStrictEqual([100, 170, 30])
  })

  it("spreads the second color to mirror the third when the third moves", () => {
    const moved = moveColor(harmony, 2, { hue: 80, chroma: 0.5 })

    expect(moved.map(rounded).map((color) => color.hue)).toStrictEqual([100, 120, 80])
  })

  it("gives a theme without colors the moved color as its primary color", () => {
    expect(moveColor([], 0, { hue: 10, chroma: 0.4 })).toStrictEqual([{ hue: 10, chroma: 0.4 }])
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

  it("mirrors a second color that was spread further for the third", () => {
    const added = addHarmonyColor([
      { hue: 90, chroma: 0.6 },
      { hue: 160, chroma: 0.6 },
    ])

    expect(added.map((c) => c.hue)).toStrictEqual([90, 160, 20])
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
