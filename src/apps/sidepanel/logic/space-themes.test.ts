import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { neutralTheme, presetPages, swatchOf, themeOf, type ThemeColor } from "#modules/theme"
import { hueWheelBackground, suggestedTheme, themeSwatch } from "./space-themes"

const red: ThemeColor = { hue: 20, chroma: 0.8 }
const green: ThemeColor = { hue: 150, chroma: 0.75 }

describe("themeSwatch", () => {
  it("色の無いテーマには見本が無い", () => {
    expect(Option.isNone(themeSwatch([]))).toBe(true)
  })

  it("1 色ならその色の見本になる", () => {
    expect(themeSwatch([red])).toStrictEqual(Option.some(swatchOf(red)))
  })

  it("2 色以上なら、先頭の色から順に並べたグラデーションになる", () => {
    const swatch = Option.getOrThrow(themeSwatch([red, green]))

    expect(swatch).toMatch(/^linear-gradient\(/)
    expect(swatch.indexOf(swatchOf(red))).toBeLessThan(swatch.indexOf(swatchOf(green)))
  })
})

describe("suggestedTheme", () => {
  const colorfulPresets = (presetPages[0] ?? []).filter(([primary]) => (primary?.chroma ?? 0) > 0.2)

  it("まだどの Space にも使われていない色のプリセットを勧める", () => {
    const [first, second] = colorfulPresets
    const spaces = [{ theme: themeOf(first ?? []) }, { theme: neutralTheme }]

    expect(suggestedTheme(spaces).colors).toStrictEqual(second)
  })

  it("無彩色に近いプリセットは勧めない", () => {
    const suggestion = suggestedTheme([])

    expect(suggestion.colors[0]?.chroma).toBeGreaterThan(0.2)
  })

  it("すべてのプリセットが使われていれば、Space の数に応じて巡回して勧める", () => {
    const spaces = colorfulPresets.map((colors) => ({ theme: themeOf(colors) }))

    expect(suggestedTheme(spaces).colors).toStrictEqual(colorfulPresets[0])
  })

  it("勧めるテーマのモード・強さ・グレインは既定値になる", () => {
    const { mode, intensity, grain } = suggestedTheme([])

    expect({ mode, intensity, grain }).toStrictEqual({
      mode: neutralTheme.mode,
      intensity: neutralTheme.intensity,
      grain: neutralTheme.grain,
    })
  })
})

describe("hueWheelBackground", () => {
  it("右から時計回りに、色相 0・270・180・90 の色が並ぶ", () => {
    const background = hueWheelBackground()
    const positions = [0, 270, 180, 90].map((hue) =>
      background.indexOf(swatchOf({ hue, chroma: 1 })),
    )

    expect(background).toContain("from 90deg")
    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b))
  })
})
