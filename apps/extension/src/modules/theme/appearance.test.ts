import { describe, expect, it } from "vitest"
import {
  appearanceOf,
  gradientStopPositions,
  resolveScheme,
  swatchOf,
  themeColorOfSrgb,
} from "./appearance"
import { fromSrgb, type Rgb } from "./oklch"
import { themeOf, type SpaceTheme } from "./space-theme"
import { textureTileOf, ThemeTexture } from "./textures"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const withMode = (theme: SpaceTheme, mode: SpaceTheme["mode"]): SpaceTheme => ({ ...theme, mode })

const rgbOfCss = (css: string): Rgb => {
  const [red = 0, green = 0, blue = 0] = (css.match(/\d+/g) ?? []).map(Number)
  return { red: red / 255, green: green / 255, blue: blue / 255 }
}
const oklchOfCss = (css: string) => fromSrgb(rgbOfCss(css))

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

  it("paints each gradient color where gradientStopPositions says, the first over a longer stretch", () => {
    const threeColors = themeOf([
      { hue: 90, chroma: 0.8 },
      { hue: 200, chroma: 0.8 },
      { hue: 300, chroma: 0.8 },
    ])

    expect({
      positions: gradientStopPositions(3),
      stops: appearanceOf(threeColors, "light").background.match(/\d+%/g),
    }).toStrictEqual({ positions: [0.15, 0.7, 1], stops: ["15%", "70%", "100%"] })
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

  it("paints every hue at the same lightness for the same chroma and intensity in the light scheme", () => {
    const lightnessOf = (hue: number) =>
      oklchOfCss(
        appearanceOf(withMode(themeOf([{ hue, chroma: 0.6 }]), "light"), "light").background,
      ).lightness

    expect(Math.abs(lightnessOf(100) - lightnessOf(300))).toBeLessThan(0.01)
  })

  it("paints a more vivid color deeper in the light scheme, from near-white for the palest", () => {
    const backgroundOf = (chroma: number) =>
      oklchOfCss(
        appearanceOf(
          { ...withMode(themeOf([{ hue: 350, chroma }]), "light"), intensity: 1 },
          "light",
        ).background,
      )
    const [palest, vivid] = [backgroundOf(0), backgroundOf(1)]

    expect([palest.lightness > 0.88, palest.chroma < 0.01]).toStrictEqual([true, true])
    expect([vivid.lightness < palest.lightness - 0.15, vivid.chroma > 0.18]).toStrictEqual([
      true,
      true,
    ])
  })

  it("keeps dark text on every hue at the most vivid chroma and full intensity in the light scheme", () => {
    const texts = Array.from(
      { length: 12 },
      (_, step) =>
        appearanceOf(
          { ...withMode(themeOf([{ hue: step * 30, chroma: 1 }]), "light"), intensity: 1 },
          "light",
        ).text,
    )

    expect(texts.every(isDarkText)).toBe(true)
  })

  it("still tints the background of a pale color in the light scheme", () => {
    const cream = withMode(themeOf([{ hue: 90, chroma: 0.2 }]), "light")

    expect(oklchOfCss(appearanceOf(cream, "light").background).chroma).toBeGreaterThan(0.01)
  })

  it("gives a gray theme gray folders", () => {
    const { folderTab, folderFill, folderLine } = appearanceOf(
      themeOf([{ hue: 0, chroma: 0 }]),
      "light",
    )

    expect([folderTab, folderFill, folderLine].map((css) => oklchOfCss(css).chroma)).toStrictEqual([
      expect.closeTo(0, 2),
      expect.closeTo(0, 2),
      expect.closeTo(0, 2),
    ])
  })

  it("gives folders of a pale color a clear tint of its hue", () => {
    const tab = oklchOfCss(appearanceOf(themeOf([{ hue: 90, chroma: 0.25 }]), "light").folderTab)

    expect([tab.chroma > 0.05, Math.abs(tab.hue - 90) < 10]).toStrictEqual([true, true])
  })

  it("draws the folder's outline darker than its inside in the light scheme and lighter in the dark", () => {
    const contrastOf = (scheme: "light" | "dark") => {
      const appearance = appearanceOf(withMode(yellow, scheme), scheme)
      return (
        oklchOfCss(appearance.folderLine).lightness - oklchOfCss(appearance.folderFill).lightness
      )
    }

    expect([contrastOf("light") < 0, contrastOf("dark") > 0]).toStrictEqual([true, true])
  })

  it("raises the texture's opacity with the grain strength", () => {
    const opacityAt = (grain: number) => appearanceOf({ ...yellow, grain }, "light").grainOpacity

    expect(opacityAt(0) < opacityAt(0.5) && opacityAt(0.5) < opacityAt(1)).toBe(true)
  })

  it("lays the chosen texture's tile over the background, at the tile's size", () => {
    const appearance = appearanceOf({ ...yellow, texture: "linen" }, "light")
    const tile = textureTileOf("linen")

    expect([appearance.grainImage, appearance.grainTileSize]).toStrictEqual([
      tile.image,
      `${tile.sizePx}px ${tile.sizePx}px`,
    ])
  })

  it("keeps every texture's opacity within full opacity at the strongest grain", () => {
    const opacities = ThemeTexture.literals.map(
      (texture) => appearanceOf({ ...yellow, grain: 1, texture }, "light").grainOpacity,
    )

    expect(opacities.every((opacity) => opacity > 0 && opacity <= 1)).toBe(true)
  })
})

describe("swatchOf", () => {
  it("shows chroma 0 as a near-white", () => {
    const swatch = oklchOfCss(swatchOf({ hue: 200, chroma: 0 }))

    expect([swatch.lightness > 0.95, swatch.chroma]).toStrictEqual([true, expect.closeTo(0, 2)])
  })

  it("shows chroma 1 as the most vivid color of the hue", () => {
    expect(swatchOf({ hue: 29.23, chroma: 1 })).toBe("rgb(255 0 0)")
  })

  it("shows yellow lighter than blue at the same chroma", () => {
    const lightnessOf = (hue: number) => oklchOfCss(swatchOf({ hue, chroma: 0.6 })).lightness

    expect(lightnessOf(100)).toBeGreaterThan(lightnessOf(265))
  })
})

describe("themeColorOfSrgb", () => {
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

    expect([color.hue, color.chroma]).toStrictEqual([expect.closeTo(29, 0), expect.closeTo(1, 2)])
  })
})
