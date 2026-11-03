import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { neutralTheme, presetPages, swatchOf, themeOf, type ThemeColor } from "#modules/theme"
import { hueWheelBackground, suggestedTheme, themeSwatch } from "./space-themes"

const red: ThemeColor = { hue: 20, chroma: 0.8 }
const green: ThemeColor = { hue: 150, chroma: 0.75 }

describe("themeSwatch", () => {
  it("has no swatch for a theme without colors", () => {
    expect(Option.isNone(themeSwatch([]))).toBe(true)
  })

  it("is a swatch of that color for a single color", () => {
    expect(themeSwatch([red])).toStrictEqual(Option.some(swatchOf(red)))
  })

  it("is a gradient in color order for two or more colors", () => {
    const swatch = Option.getOrThrow(themeSwatch([red, green]))

    expect(swatch).toMatch(/^linear-gradient\(/)
    expect(swatch.indexOf(swatchOf(red))).toBeLessThan(swatch.indexOf(swatchOf(green)))
  })
})

describe("suggestedTheme", () => {
  const colorfulPresets = (presetPages[0] ?? []).filter(([primary]) => (primary?.chroma ?? 0) > 0.2)

  it("suggests a preset whose colors no Space uses yet", () => {
    const [first, second] = colorfulPresets
    const spaces = [{ theme: themeOf(first ?? []) }, { theme: neutralTheme }]

    expect(suggestedTheme(spaces).colors).toStrictEqual(second)
  })

  it("doesn't suggest near-neutral presets", () => {
    const suggestion = suggestedTheme([])

    expect(suggestion.colors[0]?.chroma).toBeGreaterThan(0.2)
  })

  it("cycles through presets by the number of Spaces once every preset is used", () => {
    const spaces = colorfulPresets.map((colors) => ({ theme: themeOf(colors) }))

    expect(suggestedTheme(spaces).colors).toStrictEqual(colorfulPresets[0])
  })

  it("suggests themes with the default mode, intensity, and grain", () => {
    const { mode, intensity, grain } = suggestedTheme([])

    expect({ mode, intensity, grain }).toStrictEqual({
      mode: neutralTheme.mode,
      intensity: neutralTheme.intensity,
      grain: neutralTheme.grain,
    })
  })
})

describe("hueWheelBackground", () => {
  it("places hues 0, 270, 180, and 90 clockwise from the right", () => {
    const background = hueWheelBackground()
    const positions = [0, 270, 180, 90].map((hue) =>
      background.indexOf(swatchOf({ hue, chroma: 1 })),
    )

    expect(background).toContain("from 90deg")
    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b))
  })
})
