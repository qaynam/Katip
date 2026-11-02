import type { TabGroupColor } from "#platform/browser"
import { themeOf, type SpaceTheme, type ThemeColor } from "./space-theme"

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

/** The presets under the picker. The first page holds single colors, the second gradients. */
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

// Chrome's tab group color names and the hues that look closest to them, so that group sync can
// round a Space's color to the nearest group color
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

// Below this chroma a color doesn't look like any hue's group color
const ACHROMATIC_CHROMA = 0.15

const hueDistance = (a: number, b: number) => {
  const difference = Math.abs(a - b) % 360
  return Math.min(difference, 360 - difference)
}

/** Returns the Chrome tab group color nearest the theme's primary color. */
export const groupColorOf = (theme: SpaceTheme): TabGroupColor => {
  const primary = theme.colors[0]
  if (primary === undefined || primary.chroma < ACHROMATIC_CHROMA) return "grey"
  const [nearest] = [...groupHues].sort(
    ([, a], [, b]) => hueDistance(primary.hue, a) - hueDistance(primary.hue, b),
  )
  return nearest?.[0] ?? "grey"
}

/** Makes a theme whose primary color is the given Chrome tab group color. */
export const themeOfGroupColor = (groupColor: TabGroupColor): SpaceTheme => {
  const hue = groupHues.find(([name]) => name === groupColor)?.[1]
  return hue === undefined ? themeOf([]) : themeOf([color(hue, 0.7)])
}
