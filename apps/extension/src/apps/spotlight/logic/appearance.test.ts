import { describe, expect, it } from "vitest"
import { appearanceOf, neutralTheme, themeOf } from "#modules/theme"
import { spotlightAppearance } from "./appearance"

const blue = themeOf([{ hue: 250, chroma: 0.8 }])

describe("spotlightAppearance", () => {
  it("is light or dark as the Space's theme says, like the side panel", () => {
    expect([
      spotlightAppearance({ ...blue, mode: "dark" }, "light").scheme,
      spotlightAppearance({ ...blue, mode: "light" }, "dark").scheme,
    ]).toStrictEqual(["dark", "light"])
  })

  it("follows the OS when the Space's theme is automatic", () => {
    expect(spotlightAppearance({ ...blue, mode: "auto" }, "dark").scheme).toBe("dark")
  })

  it("is paler than the Space's theme", () => {
    const vivid = { ...blue, intensity: 1 }

    expect(spotlightAppearance(vivid, "light").background).not.toBe(
      appearanceOf(vivid, "light").background,
    )
  })

  it("keeps the intensity of a theme that is pale already", () => {
    const pale = { ...blue, intensity: 0.1 }

    expect(spotlightAppearance(pale, "dark").background).toBe(appearanceOf(pale, "dark").background)
  })

  it("without a theme, is the same as with the neutral theme", () => {
    expect(spotlightAppearance(null, "dark")).toStrictEqual(
      spotlightAppearance(neutralTheme, "dark"),
    )
  })
})
