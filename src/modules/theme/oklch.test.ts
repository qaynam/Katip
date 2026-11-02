import { describe, expect, it } from "vitest"
import { contrastRatio, relativeLuminance, rgbCss, toSrgb } from "./oklch"

const white = { red: 1, green: 1, blue: 1 }
const black = { red: 0, green: 0, blue: 0 }

describe("toSrgb", () => {
  it("turns lightness 1 with chroma 0 into white", () => {
    expect(rgbCss(toSrgb({ lightness: 1, chroma: 0, hue: 0 }))).toBe("rgb(255 255 255)")
  })

  it("turns lightness 0 into black", () => {
    expect(rgbCss(toSrgb({ lightness: 0, chroma: 0, hue: 0 }))).toBe("rgb(0 0 0)")
  })

  it("turns hue 29 degrees at high chroma into a strongly red color", () => {
    const rgb = toSrgb({ lightness: 0.63, chroma: 0.26, hue: 29 })

    expect(rgb.red > rgb.green && rgb.red > rgb.blue).toBe(true)
  })

  it("keeps every channel within 0 to 1 even for chroma sRGB can't show", () => {
    const rgb = toSrgb({ lightness: 0.9, chroma: 0.4, hue: 145 })

    expect([rgb.red, rgb.green, rgb.blue].every((c) => c >= 0 && c <= 1)).toBe(true)
  })
})

describe("relativeLuminance and contrastRatio", () => {
  it("give white a relative luminance of 1 and black 0", () => {
    expect([relativeLuminance(white), relativeLuminance(black)]).toStrictEqual([1, 0])
  })

  it("give white and black a contrast ratio of 21, in either argument order", () => {
    expect([contrastRatio(white, black), contrastRatio(black, white)]).toStrictEqual([21, 21])
  })
})
