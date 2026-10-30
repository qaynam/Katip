import { describe, expect, it } from "vitest"
import { settleTheme, themeEquivalence, themeOf } from "./space-theme"

describe("settleTheme", () => {
  it("色・強さ・グレインを小数第 3 位までに丸める", () => {
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

  it("色相が 360 度に丸まったときは 0 度として扱う", () => {
    expect(settleTheme(themeOf([{ hue: 359.9996, chroma: 0.5 }])).colors).toStrictEqual([
      { hue: 0, chroma: 0.5 },
    ])
  })
})

describe("themeEquivalence", () => {
  it("同じ値のテーマは、別のオブジェクトでも等しい", () => {
    const colors = [{ hue: 10, chroma: 0.5 }]

    expect(themeEquivalence(themeOf(colors), themeOf([...colors]))).toBe(true)
  })
})
