import { describe, expect, it } from "vitest"
import { groupColorOf, presetPages, themeOfGroupColor } from "./presets"
import { themeOf } from "./space-theme"

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

describe("presetPages", () => {
  it("puts nine single colors on the first page", () => {
    expect(presetPages[0]?.map((colors) => colors.length)).toStrictEqual(Array(9).fill(1))
  })

  it("puts nine two-color gradients on the second page", () => {
    expect(presetPages[1]?.map((colors) => colors.length)).toStrictEqual(Array(9).fill(2))
  })
})
