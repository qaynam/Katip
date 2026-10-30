import { describe, expect, it } from "vitest"
import { appearanceOf, resolveScheme } from "./appearance"
import { themeOf, type SpaceTheme } from "./space-theme"

const yellow = themeOf([{ hue: 90, chroma: 0.8 }])
const withMode = (theme: SpaceTheme, mode: SpaceTheme["mode"]): SpaceTheme => ({ ...theme, mode })

const isDarkText = (css: string) => css.startsWith("rgb(28 28 31")
const isLightText = (css: string) => css.startsWith("rgb(255 255 255")

describe("resolveScheme", () => {
  it("auto は OS の設定に従う", () => {
    expect([resolveScheme("auto", "light"), resolveScheme("auto", "dark")]).toStrictEqual([
      "light",
      "dark",
    ])
  })

  it("light と dark は OS の設定によらず固定される", () => {
    expect([resolveScheme("light", "dark"), resolveScheme("dark", "light")]).toStrictEqual([
      "light",
      "dark",
    ])
  })
})

describe("appearanceOf", () => {
  it("明るい背景には濃い文字色が選ばれる", () => {
    const appearance = appearanceOf(withMode(yellow, "light"), "dark")

    expect(isDarkText(appearance.text)).toBe(true)
  })

  it("暗い背景には白い文字色が選ばれる", () => {
    const appearance = appearanceOf(withMode(yellow, "dark"), "light")

    expect(isLightText(appearance.text)).toBe(true)
  })

  it("2 色以上のテーマはグラデーションの背景になる", () => {
    const gradient = themeOf([
      { hue: 90, chroma: 0.8 },
      { hue: 40, chroma: 0.8 },
    ])

    expect(appearanceOf(gradient, "light").background).toMatch(/^linear-gradient\(/)
  })

  it("1 色のテーマは単色の背景になる", () => {
    expect(appearanceOf(yellow, "light").background).toMatch(/^rgb\(/)
  })

  it("色の無いテーマでも背景と文字色が決まる", () => {
    const appearance = appearanceOf(themeOf([]), "dark")

    expect([appearance.background.startsWith("rgb("), isLightText(appearance.text)]).toStrictEqual([
      true,
      true,
    ])
  })

  it("グレインの強さに比例してノイズの不透明度が上がる", () => {
    const opacityAt = (grain: number) => appearanceOf({ ...yellow, grain }, "light").grainOpacity

    expect(opacityAt(0) < opacityAt(0.5) && opacityAt(0.5) < opacityAt(1)).toBe(true)
  })
})
