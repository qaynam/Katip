import { describe, expect, it } from "vitest"
import { appearanceOf } from "./appearance"
import { relativeLuminance } from "./oklch"
import {
  applyPreset,
  groupColorOf,
  presetPages,
  themeOfGroupColor,
  type ThemePreset,
} from "./presets"
import { neutralTheme, themeOf, type SpaceTheme } from "./space-theme"

describe("groupColorOf", () => {
  it.each([
    [25, "red"],
    [90, "yellow"],
    [150, "green"],
    [250, "blue"],
    [355, "pink"],
    [5, "pink"],
  ] as const)("puts a primary color of hue %d degrees in the %s group", (hue, expected) => {
    expect(groupColorOf(themeOf([{ hue, chroma: 0.8 }]))).toBe(expected)
  })

  it("puts a low-chroma primary color or a theme without colors in the grey group", () => {
    expect([
      groupColorOf(themeOf([{ hue: 90, chroma: 0.05 }])),
      groupColorOf(themeOf([])),
    ]).toStrictEqual(["grey", "grey"])
  })

  it("decides a gradient's group color by its primary color alone", () => {
    const theme = themeOf([
      { hue: 255, chroma: 0.8 },
      { hue: 25, chroma: 0.8 },
    ])

    expect(groupColorOf(theme)).toBe("blue")
  })
})

describe("themeOfGroupColor", () => {
  it("makes a theme that maps back to the same group color", () => {
    const colors = [
      "red",
      "orange",
      "yellow",
      "green",
      "cyan",
      "blue",
      "purple",
      "pink",
      "grey",
    ] as const

    expect(colors.map((color) => groupColorOf(themeOfGroupColor(color)))).toStrictEqual([...colors])
  })
})

const colorsOf = (preset: ThemePreset | undefined) =>
  preset?._tag === "Colors" ? preset.colors : undefined

const luminanceOfCss = (css: string) => {
  const [red = 0, green = 0, blue = 0] = (css.match(/\d+/g) ?? []).map(Number)
  return relativeLuminance({ red: red / 255, green: green / 255, blue: blue / 255 })
}

describe("presetPages", () => {
  it("puts nine single colors on the first page", () => {
    expect(presetPages[0]?.map((preset) => colorsOf(preset)?.length)).toStrictEqual(
      Array(9).fill(1),
    )
  })

  it("puts nine three-color gradients on the second page, spread evenly around the primary color", () => {
    const spreads = presetPages[1]?.map((preset) => {
      const [primary, second, third] = colorsOf(preset) ?? []
      const turn = (to: number | undefined) =>
        ((((to ?? 0) - (primary?.hue ?? 0) + 540) % 360) - 180).toFixed(3)
      return [turn(second?.hue), turn(third?.hue)]
    })

    expect(spreads).toStrictEqual(Array(9).fill(["25.000", "-25.000"]))
  })

  it("puts nine grays on the third page, from the lightest to the darkest", () => {
    const luminances = (presetPages[2] ?? []).map((preset) =>
      luminanceOfCss(appearanceOf(applyPreset(neutralTheme, preset), "light").background),
    )

    expect(luminances).toHaveLength(9)
    expect(luminances).toStrictEqual([...luminances].sort((a, b) => b - a))
  })
})

describe("applyPreset", () => {
  const tuned: SpaceTheme = {
    mode: "dark",
    colors: [{ hue: 90, chroma: 0.8 }],
    intensity: 0.3,
    grain: 0.6,
  }

  it("changes only the colors for a color preset", () => {
    const colors = [{ hue: 20, chroma: 0.7 }]

    expect(applyPreset(tuned, { _tag: "Colors", colors })).toStrictEqual({ ...tuned, colors })
  })

  it("gives a gray one achromatic color and its scheme and intensity, keeping the grain", () => {
    const grayed = applyPreset(tuned, { _tag: "Gray", mode: "light", intensity: 0.7 })

    expect(grayed).toStrictEqual({
      mode: "light",
      colors: [{ hue: 0, chroma: 0 }],
      intensity: 0.7,
      grain: 0.6,
    })
  })
})
