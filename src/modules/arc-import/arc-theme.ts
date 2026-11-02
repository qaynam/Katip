import { Array, Option, Schema } from "effect"
import {
  DEFAULT_GRAIN,
  DEFAULT_INTENSITY,
  MAX_THEME_COLORS,
  settleTheme,
  themeColorOfSrgb,
  themeOf,
  type SpaceTheme,
  type ThemeColor,
} from "#modules/theme"

/** Channels are 0 to 1, and may fall slightly outside in Arc's extended sRGB. */
const ArcColor = Schema.Struct({
  red: Schema.Finite,
  green: Schema.Finite,
  blue: Schema.Finite,
  alpha: Schema.optional(Schema.Finite),
})
type ArcColor = typeof ArcColor.Type

const BlendedGradient = Schema.Struct({
  baseColors: Schema.Array(Schema.Unknown),
  modifiers: Schema.optional(
    Schema.Struct({
      intensityFactor: Schema.optional(Schema.Unknown),
      noiseFactor: Schema.optional(Schema.Unknown),
    }),
  ),
})

const wrapped = <S extends Schema.Top>(schema: S) => Schema.Struct({ _0: schema })

const GradientTheme = Schema.Struct({
  windowTheme: Schema.Struct({
    background: Schema.Struct({
      single: wrapped(
        Schema.Struct({
          style: Schema.Struct({
            color: wrapped(Schema.Struct({ blendedGradient: wrapped(BlendedGradient) })),
          }),
        }),
      ),
    }),
  }),
})

const PaletteTheme = Schema.Struct({
  windowTheme: Schema.Struct({ primaryColorPalette: Schema.Struct({ midTone: ArcColor }) }),
})

const decodeGradientTheme = Schema.decodeUnknownOption(GradientTheme)
const decodePaletteTheme = Schema.decodeUnknownOption(PaletteTheme)
const decodeColor = Schema.decodeUnknownOption(ArcColor)
const decodeUnitInterval = Schema.decodeUnknownOption(
  Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
)

const isVisible = (color: ArcColor) => color.alpha === undefined || color.alpha > 0

const themeColorOf = (color: ArcColor): ThemeColor =>
  themeColorOfSrgb({ red: color.red, green: color.green, blue: color.blue })

const unitOr = (value: unknown, fallback: number) =>
  Option.getOrElse(decodeUnitInterval(value), () => fallback)

const gradientThemeOf = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.flatMap(decodeGradientTheme(customInfo), (decoded) => {
    const gradient = decoded.windowTheme.background.single._0.style.color._0.blendedGradient._0
    const colors = Array.getSomes(gradient.baseColors.map((color) => decodeColor(color)))
      .filter(isVisible)
      .map(themeColorOf)
    return Option.liftPredicate(
      {
        ...themeOf(colors),
        intensity: unitOr(gradient.modifiers?.intensityFactor, DEFAULT_INTENSITY),
        grain: unitOr(gradient.modifiers?.noiseFactor, DEFAULT_GRAIN),
      },
      (theme) => theme.colors.length > 0,
    )
  })

const paletteThemeOf = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.map(decodePaletteTheme(customInfo), ({ windowTheme }) =>
    themeOf([themeColorOf(windowTheme.primaryColorPalette.midTone)]),
  )

// Base colors that come out as the same Katip color would make a gradient of one color, which
// looks solid but shows as several colors in the theme picker
const sameColor = (a: ThemeColor, b: ThemeColor) => a.hue === b.hue && a.chroma === b.chroma

const withDistinctColors = (theme: SpaceTheme): SpaceTheme => ({
  ...theme,
  colors: Array.dedupeWith(theme.colors, sameColor).slice(0, MAX_THEME_COLORS),
})

/**
 * The Katip theme closest to an Arc Space's theme, read from the Space's `customInfo`.
 *
 * @remarks
 * The gradient's base colors become the theme's colors, and its intensity and noise the theme's
 * intensity and grain. A theme without a gradient falls back to the main color of its palette.
 * Light and dark follow the system, whatever Arc's appearance setting.
 *
 * @returns `None` when the Space has no theme Katip can read.
 */
export const themeOfArcSpace = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.map(
    Option.orElse(gradientThemeOf(customInfo), () => paletteThemeOf(customInfo)),
    (theme) => withDistinctColors(settleTheme(theme)),
  )
