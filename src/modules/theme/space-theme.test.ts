import { describe, expect, it } from "vitest"
import { settleTheme, themeEquivalence, themeOf } from "./space-theme"

describe("settleTheme", () => {
  it("rounds colors, intensity and grain to three decimal places", () => {
    const settled = settleTheme({
      ...themeOf([{ hue: 123.45678, chroma: 0.987654 }]),
      intensity: 0.976812,
      grain: 0.1234567,
    })

    expect([settled.colors, settled.intensity, settled.grain]).toStrictEqual([
      [{ hue: 123.457, chroma: 0.988 }],
      0.977,
      0.123,
    ])
  })

  it("treats a hue rounded up to 360 degrees as 0 degrees", () => {
    expect(settleTheme(themeOf([{ hue: 359.9996, chroma: 0.5 }])).colors).toStrictEqual([
      { hue: 0, chroma: 0.5 },
    ])
  })
})

describe("themeEquivalence", () => {
  it("treats themes with the same values as equal even as different objects", () => {
    const colors = [{ hue: 10, chroma: 0.5 }]

    expect(themeEquivalence(themeOf(colors), themeOf([...colors]))).toBe(true)
  })
})
