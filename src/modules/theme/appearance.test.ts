import { describe, expect, it } from "vitest"
import { appearanceOf, resolveScheme, swatchOf, themeColorOfSrgb } from "./appearance"
import type { Rgb } from "./oklch"
import { themeOf, type SpaceTheme } from "./space-theme"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const withMode = (theme: SpaceTheme, mode: SpaceTheme["mode"]): SpaceTheme => ({ ...theme, mode })

const isDarkText = (css: string) => css.startsWith("rgb(28 28 31")
const isLightText = (css: string) => css.startsWith("rgb(255 255 255")

describe("resolveScheme", () => {
  it("auto follows the OS setting", () => {
    expect([resolveScheme("auto", "light"), resolveScheme("auto", "dark")]).toStrictEqual([
      "light",
      "dark",
    ])
  })

  it("light and dark stay fixed whatever the OS setting", () => {
    expect([resolveScheme("light", "dark"), resolveScheme("dark", "light")]).toStrictEqual([
      "light",
      "dark",
    ])
  })
})

describe("appearanceOf", () => {
  it("picks dark text for a light background", () => {
    const appearance = appearanceOf(withMode(yellow, "light"), "dark")

    expect(isDarkText(appearance.text)).toBe(true)
  })

  it("picks white text for a dark background", () => {
    const appearance = appearanceOf(withMode(yellow, "dark"), "light")

    expect(isLightText(appearance.text)).toBe(true)
  })

  it("gives a theme of two or more colors a gradient background", () => {
    const gradient = themeOf([
      { hue: 90, chroma: 0.8 },
      { hue: 40, chroma: 0.8 },
    ])

    expect(appearanceOf(gradient, "light").background).toMatch(/^linear-gradient\(/)
  })

  it("gives a one-color theme a solid background", () => {
    expect(appearanceOf(yellow, "light").background).toMatch(/^rgb\(/)
  })

  it("gives a theme without colors a background and a text color too", () => {
    const appearance = appearanceOf(themeOf([]), "dark")

    expect([appearance.background.startsWith("rgb("), isLightText(appearance.text)]).toStrictEqual([
      true,
      true,
    ])
  })

  it("raises the noise opacity with the grain strength", () => {
    const opacityAt = (grain: number) => appearanceOf({ ...yellow, grain }, "light").grainOpacity

    expect(opacityAt(0) < opacityAt(0.5) && opacityAt(0.5) < opacityAt(1)).toBe(true)
  })
})

describe("themeColorOfSrgb", () => {
  const rgbOfCss = (css: string): Rgb => {
    const [red = 0, green = 0, blue = 0] = (css.match(/\d+/g) ?? []).map(Number)
    return { red: red / 255, green: green / 255, blue: blue / 255 }
  }

  it("reads a swatch back as the theme color it shows", () => {
    const color = themeColorOfSrgb(rgbOfCss(swatchOf({ hue: 150, chroma: 0.6 })))

    expect([color.hue, color.chroma]).toStrictEqual([
      expect.closeTo(150, 0),
      expect.closeTo(0.6, 1),
    ])
  })

  it("reads gray as a color with no chroma", () => {
    expect(themeColorOfSrgb({ red: 0.5, green: 0.5, blue: 0.5 }).chroma).toBeCloseTo(0, 3)
  })

  it("reads a color more vivid than any swatch as the most vivid color of its hue", () => {
    const color = themeColorOfSrgb({ red: 1, green: 0, blue: 0 })

    expect([color.hue, color.chroma]).toStrictEqual([expect.closeTo(29, 0), 1])
  })
})
