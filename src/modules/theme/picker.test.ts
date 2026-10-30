import { describe, expect, it } from "vitest"
import { addHarmonyColor, colorAtPoint, pointOfColor, removeLastColor } from "./picker"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

const rounded = (color: ThemeColor) => ({
  hue: Math.round(color.hue),
  chroma: Math.round(color.chroma * 100) / 100,
})

describe("ピッカーの位置と色", () => {
  it("中心から右へ向かう方向が色相 0 度、上が 90 度になる", () => {
    expect([colorAtPoint({ x: 1, y: 0 }), colorAtPoint({ x: 0, y: 1 })].map(rounded)).toStrictEqual(
      [
        { hue: 0, chroma: 1 },
        { hue: 90, chroma: 1 },
      ],
    )
  })

  it("中心からの距離が彩度になる", () => {
    expect(rounded(colorAtPoint({ x: 0, y: -0.5 }))).toStrictEqual({ hue: 270, chroma: 0.5 })
  })

  it("円の外を指すと、同じ方向の縁の色になる", () => {
    expect(rounded(colorAtPoint({ x: 3, y: 0 }))).toStrictEqual({ hue: 0, chroma: 1 })
  })

  it("色から求めた位置を色に戻すと元の色になる", () => {
    const color = { hue: 123, chroma: 0.42 }

    expect(rounded(colorAtPoint(pointOfColor(color)))).toStrictEqual(color)
  })
})

describe("色の追加と削除", () => {
  it("色を足すと、主色から色相をずらした同じ彩度の色が加わる", () => {
    const added = addHarmonyColor([{ hue: 90, chroma: 0.6 }])

    expect(added).toStrictEqual([
      { hue: 90, chroma: 0.6 },
      { hue: 130, chroma: 0.6 },
    ])
  })

  it("3 色目は主色の反対側へずらす", () => {
    const added = addHarmonyColor(addHarmonyColor([{ hue: 90, chroma: 0.6 }]))

    expect(added.map((c) => c.hue)).toStrictEqual([90, 130, 50])
  })

  it(`${MAX_THEME_COLORS} 色を超えては足せない`, () => {
    const full = addHarmonyColor(addHarmonyColor([{ hue: 90, chroma: 0.6 }]))

    expect(addHarmonyColor(full)).toBe(full)
  })

  it("色の無いテーマに足すと、1 色目が加わる", () => {
    expect(addHarmonyColor([])).toHaveLength(1)
  })

  it("最後に足した色から取り除かれ、主色は残る", () => {
    const primary = { hue: 90, chroma: 0.6 }
    const colors = [primary, { hue: 130, chroma: 0.6 }]

    expect([removeLastColor(colors), removeLastColor([primary])]).toStrictEqual([
      [primary],
      [primary],
    ])
  })
})
