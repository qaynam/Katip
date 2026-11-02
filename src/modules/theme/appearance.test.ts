import { describe, expect, it } from "vitest"
import { appearanceOf, resolveScheme } from "./appearance"
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
