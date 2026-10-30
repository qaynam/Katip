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
  ] as const)("色相 %d 度の主色は %s のグループになる", (hue, expected) => {
    expect(groupColorOf(themeOf([{ hue, chroma: 0.8 }]))).toBe(expected)
  })

  it("彩度の低い主色や色の無いテーマは grey のグループになる", () => {
    expect([
      groupColorOf(themeOf([{ hue: 90, chroma: 0.05 }])),
      groupColorOf(themeOf([])),
    ]).toStrictEqual(["grey", "grey"])
  })

  it("グラデーションでは主色だけでグループの色が決まる", () => {
    const theme = themeOf([
      { hue: 255, chroma: 0.8 },
      { hue: 25, chroma: 0.8 },
    ])

    expect(groupColorOf(theme)).toBe("blue")
  })
})

describe("themeOfGroupColor", () => {
  it("グループの色から作ったテーマは、同じグループの色に戻る", () => {
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
  it("1 ページ目には単色が 9 個並ぶ", () => {
    expect(presetPages[0]?.map((colors) => colors.length)).toStrictEqual(Array(9).fill(1))
  })

  it("2 ページ目には 2 色のグラデーションが 9 個並ぶ", () => {
    expect(presetPages[1]?.map((colors) => colors.length)).toStrictEqual(Array(9).fill(2))
  })
})
