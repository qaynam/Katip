import { describe, expect, it } from "vitest"
import { contrastRatio, relativeLuminance, rgbCss, toSrgb } from "./oklch"

const white = { red: 1, green: 1, blue: 1 }
const black = { red: 0, green: 0, blue: 0 }

describe("toSrgb", () => {
  it("明るさ 1・彩度 0 は白になる", () => {
    expect(rgbCss(toSrgb({ lightness: 1, chroma: 0, hue: 0 }))).toBe("rgb(255 255 255)")
  })

  it("明るさ 0 は黒になる", () => {
    expect(rgbCss(toSrgb({ lightness: 0, chroma: 0, hue: 0 }))).toBe("rgb(0 0 0)")
  })

  it("色相 29 度・高彩度は赤みの強い色になる", () => {
    const rgb = toSrgb({ lightness: 0.63, chroma: 0.26, hue: 29 })

    expect(rgb.red > rgb.green && rgb.red > rgb.blue).toBe(true)
  })

  it("sRGB で表せない彩度を指定しても、各チャンネルは 0〜1 に収まる", () => {
    const rgb = toSrgb({ lightness: 0.9, chroma: 0.4, hue: 145 })

    expect([rgb.red, rgb.green, rgb.blue].every((c) => c >= 0 && c <= 1)).toBe(true)
  })
})

describe("relativeLuminance と contrastRatio", () => {
  it("白の相対輝度は 1、黒は 0", () => {
    expect([relativeLuminance(white), relativeLuminance(black)]).toStrictEqual([1, 0])
  })

  it("白と黒のコントラスト比は 21 で、引数の順序によらない", () => {
    expect([contrastRatio(white, black), contrastRatio(black, white)]).toStrictEqual([21, 21])
  })
})
