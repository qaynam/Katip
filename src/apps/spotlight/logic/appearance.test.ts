import { describe, expect, it } from "vitest"
import { appearanceOf, neutralTheme, themeOf } from "#modules/theme"
import { spotlightAppearance } from "./appearance"

const blue = themeOf([{ hue: 250, chroma: 0.8 }])

describe("Spotlight の色", () => {
  it("Space のテーマのモードが固定でも、OS のライト／ダークに従う", () => {
    expect(spotlightAppearance({ ...blue, mode: "dark" }, "light").scheme).toBe("light")
  })

  it("Space のテーマより薄く塗る", () => {
    const vivid = { ...blue, intensity: 1 }

    expect(spotlightAppearance(vivid, "light").background).not.toBe(
      appearanceOf(vivid, "light").background,
    )
  })

  it("もともと薄いテーマはそのままの濃さで塗る", () => {
    const pale = { ...blue, intensity: 0.1 }

    expect(spotlightAppearance(pale, "dark").background).toBe(appearanceOf(pale, "dark").background)
  })

  it("テーマが分からなければ、色の無いテーマと同じに塗る", () => {
    expect(spotlightAppearance(null, "dark")).toStrictEqual(
      spotlightAppearance(neutralTheme, "dark"),
    )
  })
})
