import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  appearanceOf,
  applyPreset,
  colorAtPoint,
  neutralTheme,
  presetPages,
  swatchOf,
  themeOf,
  type ThemeColor,
} from "#modules/theme"
import { hueWheelBackground, presetSwatch, suggestedTheme, themeSwatch } from "./space-themes"

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

describe("presetSwatch", () => {
  it("shows a color preset as the swatch of its colors", () => {
    expect(presetSwatch({ _tag: "Colors", colors: [red, green] })).toBe(
      Option.getOrThrow(themeSwatch([red, green])),
    )
  })

  it("shows a gray as the background it paints", () => {
    const gray = { _tag: "Gray", mode: "dark", intensity: 0.5 } as const

    expect(presetSwatch(gray)).toBe(
      appearanceOf(applyPreset(neutralTheme, gray), "dark").background,
    )
  })
})

describe("suggestedTheme", () => {
  const colorfulPresets = (presetPages[0] ?? []).flatMap((preset) =>
    preset._tag === "Colors" && (preset.colors[0]?.chroma ?? 0) > 0.2 ? [preset.colors] : [],
  )

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
  it("tints each direction, clockwise from the right, with the color picked at the edge there", () => {
    const background = hueWheelBackground()
    const stopAt = (angle: number, point: { x: number; y: number }) =>
      `${swatchOf(colorAtPoint(point))} ${angle}deg`

    expect(background).toContain("from 90deg")
    expect(
      [stopAt(0, { x: 1, y: 0 }), stopAt(90, { x: 0, y: -1 }), stopAt(180, { x: -1, y: 0 })].every(
        (stop) => background.includes(stop),
      ),
    ).toBe(true)
  })
})
