import type { TabGroupColor } from "#platform/browser"
import { themeOf, type SpaceTheme, type ThemeColor } from "./space-theme"

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

/**
 * A preset under the picker. Colors replaces the theme's colors; Gray also sets the scheme and
 * intensity, which is what makes a gray light or dark.
 */
export type ThemePreset =
  | { readonly _tag: "Colors"; readonly colors: ReadonlyArray<ThemeColor> }
  | { readonly _tag: "Gray"; readonly mode: "light" | "dark"; readonly intensity: number }

const colors = (...colors: ReadonlyArray<ThemeColor>): ThemePreset => ({ _tag: "Colors", colors })

const gray = (mode: "light" | "dark", intensity: number): ThemePreset => ({
  _tag: "Gray",
  mode,
  intensity,
})

const GRADIENT_SPREAD_DEGREES = 25

/** Three colors spread evenly around the primary color, the way the picker keeps them. */
const gradient = (hue: number, chroma: number): ThemePreset =>
  colors(
    color(hue, chroma),
    color((hue + GRADIENT_SPREAD_DEGREES) % 360, chroma),
    color((hue + 360 - GRADIENT_SPREAD_DEGREES) % 360, chroma),
  )

/** A gray as one achromatic color, so the intensity and grain still apply to it. */
const achromatic = color(0, 0)

/** The theme a preset turns `theme` into. What the preset doesn't set stays as it was. */
export const applyPreset = (theme: SpaceTheme, preset: ThemePreset): SpaceTheme =>
  preset._tag === "Colors"
    ? { ...theme, colors: preset.colors }
    : { ...theme, colors: [achromatic], mode: preset.mode, intensity: preset.intensity }

/** The presets under the picker, a page each of single colors, gradients and grays. */
export const presetPages: ReadonlyArray<ReadonlyArray<ThemePreset>> = [
  [
    colors(color(61, 0.08)),
    colors(color(358, 0.44)),
    colors(color(320, 0.4)),
    colors(color(20, 0.73)),
    colors(color(38, 0.77)),
    colors(color(90, 0.81)),
    colors(color(155, 0.84)),
    colors(color(228, 0.6)),
    colors(color(275, 0.3)),
  ],
  [
    gradient(96, 0.07),
    gradient(20, 0.3),
    gradient(350, 0.22),
    gradient(48, 0.58),
    gradient(86, 0.74),
    gradient(122, 0.68),
    gradient(178, 0.78),
    gradient(266, 0.31),
    gradient(301, 0.15),
  ],
  [
    gray("light", 0),
    gray("light", 0.35),
    gray("light", 0.7),
    gray("light", 1),
    gray("dark", 1),
    gray("dark", 0.75),
    gray("dark", 0.5),
    gray("dark", 0.25),
    gray("dark", 0),
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
