import type { TabGroupColor } from "#platform/browser"
import { themeOf, type SpaceTheme, type ThemeColor } from "./space-theme"

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

/** ピッカーの下に並べるプリセット。1 ページ目が単色、2 ページ目がグラデーション。 */
export const presetPages: ReadonlyArray<ReadonlyArray<ReadonlyArray<ThemeColor>>> = [
  [
    [color(90, 0.05)],
    [color(350, 0.55)],
    [color(310, 0.45)],
    [color(20, 0.8)],
    [color(45, 0.85)],
    [color(90, 0.8)],
    [color(150, 0.75)],
    [color(225, 0.6)],
    [color(270, 0.25)],
  ],
  [
    [color(90, 0.1), color(250, 0.15)],
    [color(350, 0.6), color(30, 0.6)],
    [color(310, 0.5), color(350, 0.5)],
    [color(30, 0.8), color(70, 0.8)],
    [color(70, 0.8), color(120, 0.8)],
    [color(120, 0.75), color(170, 0.75)],
    [color(170, 0.7), color(220, 0.7)],
    [color(220, 0.7), color(280, 0.6)],
    [color(260, 0.35), color(310, 0.35)],
  ],
]

// Chrome のタブグループの色名と、その見た目に近い色相。グループ同期で Space の色を
// 最も近いグループ色に丸めるために使う
const groupHues: ReadonlyArray<readonly [Exclude<TabGroupColor, "grey">, number]> = [
  ["red", 25],
  ["orange", 55],
  ["yellow", 90],
  ["green", 145],
  ["cyan", 200],
  ["blue", 255],
  ["purple", 300],
  ["pink", 350],
]

// これより彩度の低い色は、どの色相のグループ色に寄せても見た目が合わない
const ACHROMATIC_CHROMA = 0.15

const hueDistance = (a: number, b: number) => {
  const difference = Math.abs(a - b) % 360
  return Math.min(difference, 360 - difference)
}

/** テーマの主色に最も近い Chrome タブグループの色を返す。 */
export const groupColorOf = (theme: SpaceTheme): TabGroupColor => {
  const primary = theme.colors[0]
  if (primary === undefined || primary.chroma < ACHROMATIC_CHROMA) return "grey"
  const [nearest] = [...groupHues].sort(
    ([, a], [, b]) => hueDistance(primary.hue, a) - hueDistance(primary.hue, b),
  )
  return nearest?.[0] ?? "grey"
}

/** Chrome タブグループの色から、その色を主色にしたテーマを作る。 */
export const themeOfGroupColor = (groupColor: TabGroupColor): SpaceTheme => {
  const hue = groupHues.find(([name]) => name === groupColor)?.[1]
  return hue === undefined ? themeOf([]) : themeOf([color(hue, 0.7)])
}
