import { Schema } from "effect"

const unitInterval = Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })))

/** auto follows the OS's light or dark scheme. */
export const ThemeMode = Schema.Literals(["auto", "light", "dark"])
export type ThemeMode = typeof ThemeMode.Type

/**
 * One color of a theme. It is the point in the picker's circle itself: the angle is the hue and the
 * distance from the center the chroma. The lightness and depth actually painted come from the light
 * or dark scheme and the intensity.
 */
export const ThemeColor = Schema.Struct({
  hue: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 360 }))),
  chroma: unitInterval,
})
export type ThemeColor = typeof ThemeColor.Type

export const MAX_THEME_COLORS = 3

export const SpaceTheme = Schema.Struct({
  mode: ThemeMode,
  /** Empty means achromatic; two or more colors make a gradient. The first is the primary color. */
  colors: Schema.Array(ThemeColor).pipe(Schema.check(Schema.isMaxLength(MAX_THEME_COLORS))),
  /** How deep the colors are. 0 is nearly achromatic, 1 the most vivid. */
  intensity: unitInterval,
  /** The strength of the grainy noise laid over the background. */
  grain: unitInterval,
})
export type SpaceTheme = typeof SpaceTheme.Type

export const DEFAULT_INTENSITY = 0.7
export const DEFAULT_GRAIN = 0.2

export const themeOf = (colors: ReadonlyArray<ThemeColor>): SpaceTheme => ({
  mode: "auto",
  colors,
  intensity: DEFAULT_INTENSITY,
  grain: DEFAULT_GRAIN,
})

export const neutralTheme: SpaceTheme = themeOf([])

const roundToThousandths = (value: number) => Math.round(value * 1000) / 1000

/**
 * Rounds the values before saving. Values from sliders and drags have many digits, so the stored
 * value would change every time even when the look doesn't.
 */
export const settleTheme = (theme: SpaceTheme): SpaceTheme => ({
  ...theme,
  colors: theme.colors.map((color) => ({
    hue: roundToThousandths(color.hue) % 360,
    chroma: roundToThousandths(color.chroma),
  })),
  intensity: roundToThousandths(theme.intensity),
  grain: roundToThousandths(theme.grain),
})

/** Whether two themes look the same. */
export const themeEquivalence = Schema.toEquivalence(SpaceTheme)
