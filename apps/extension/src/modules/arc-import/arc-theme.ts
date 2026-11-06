import { Array, Number, Option, Schema } from "effect"
import {
  DEFAULT_GRAIN,
  DEFAULT_INTENSITY,
  DEFAULT_TEXTURE,
  gradientStopPositions,
  MAX_THEME_COLORS,
  settleTheme,
  themeColorOfSrgb,
  themeOf,
  type Rgb,
  type SpaceTheme,
  type ThemeColor,
  type ThemeMode,
} from "#modules/theme"

/** Channels are 0 to 1, and may fall outside in Arc's extended sRGB. They're clamped when read. */
const ArcColor = Schema.Struct({
  red: Schema.Finite,
  green: Schema.Finite,
  blue: Schema.Finite,
  alpha: Schema.optional(Schema.Finite),
})
type ArcColor = typeof ArcColor.Type

const BlendedGradient = Schema.Struct({
  baseColors: Schema.Array(Schema.Unknown),
  overlayColors: Schema.optional(Schema.Array(Schema.Unknown)),
  modifiers: Schema.optional(
    Schema.Struct({
      intensityFactor: Schema.optional(Schema.Unknown),
      noiseFactor: Schema.optional(Schema.Unknown),
    }),
  ),
  translucencyStyle: Schema.optional(Schema.Unknown),
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
          contentOverBackgroundAppearance: Schema.optional(Schema.Unknown),
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
const decodeScheme = Schema.decodeUnknownOption(Schema.Literals(["light", "dark"]))

// Not copied as they are: Arc still paints a faint tint with no intensity, and its noise is weaker
// than Katip's grain, so the same numbers painted imported Spaces greyer and grainier than Arc. The
// mappings were fitted to Retina screenshots of Arc's window in the light scheme. With no intensity,
// Arc paints the same colors with about 0.28 of the chroma it paints at full intensity, which
// Katip does at intensity 0.2, and Katip's grain at about 0.25 varies the brightness from pixel to
// pixel as much as Arc's noise at 0.5
const INTENSITY_AT_NO_ARC_INTENSITY = 0.2
const GRAIN_PER_ARC_NOISE = 0.5

const colorsIn = (entries: ReadonlyArray<unknown>) =>
  Array.getSomes(entries.map((entry) => decodeColor(entry)))

const opacityOf = (color: ArcColor) => color.alpha ?? 1

const unit = (channel: number) => Number.clamp(channel, { minimum: 0, maximum: 1 })

/** The color within sRGB's range, ignoring its opacity. */
const rgbOf = (color: ArcColor): Rgb => ({
  red: unit(color.red),
  green: unit(color.green),
  blue: unit(color.blue),
})

/** A color with its channels multiplied by its opacity, so that mixing and layering are sums. */
interface Premultiplied {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

const premultiplied = (color: ArcColor): Premultiplied => {
  const alpha = unit(opacityOf(color))
  return {
    red: unit(color.red) * alpha,
    green: unit(color.green) * alpha,
    blue: unit(color.blue) * alpha,
    alpha,
  }
}

const mix = (a: Premultiplied, b: Premultiplied, share: number): Premultiplied => ({
  red: a.red + (b.red - a.red) * share,
  green: a.green + (b.green - a.green) * share,
  blue: a.blue + (b.blue - a.blue) * share,
  alpha: a.alpha + (b.alpha - a.alpha) * share,
})

/**
 * The color at `position` (0 at the top, 1 at the bottom) of a gradient spreading `stops` evenly.
 * A single stop fills the whole gradient.
 */
const gradientAt = (
  stops: Array.NonEmptyReadonlyArray<Premultiplied>,
  position: number,
): Premultiplied => {
  const scaled = position * (stops.length - 1)
  const index = Math.min(Math.floor(scaled), stops.length - 2)
  const from = stops[index]
  const to = stops[index + 1]
  return from !== undefined && to !== undefined
    ? mix(from, to, scaled - index)
    : Array.headNonEmpty(stops)
}

const over = (top: Premultiplied, bottom: Premultiplied): Premultiplied => ({
  red: top.red + bottom.red * (1 - top.alpha),
  green: top.green + bottom.green * (1 - top.alpha),
  blue: top.blue + bottom.blue * (1 - top.alpha),
  alpha: top.alpha + bottom.alpha * (1 - top.alpha),
})

const opaqueRgbOf = ({ red, green, blue, alpha }: Premultiplied): Rgb =>
  alpha === 0
    ? { red, green, blue }
    : { red: red / alpha, green: green / alpha, blue: blue / alpha }

/**
 * The colors Arc shows for a gradient: the visible base colors, or, with a visible overlay, what
 * Arc shows where Katip's gradient places its colors, the overlay laid over the base colors.
 */
const shownColors = (
  baseColors: ReadonlyArray<ArcColor>,
  overlayColors: ReadonlyArray<ArcColor>,
): ReadonlyArray<Rgb> => {
  const visibleBase = baseColors.filter((color) => opacityOf(color) > 0)
  const base = visibleBase.map(premultiplied)
  const overlay = overlayColors.map(premultiplied)
  if (!Array.isReadonlyArrayNonEmpty(base)) return []
  if (!Array.isReadonlyArrayNonEmpty(overlay) || overlay.every(({ alpha }) => alpha === 0)) {
    return visibleBase.map(rgbOf)
  }
  // Overlays aren't added as more colors: Arc fades them in over the base gradient, hiding the base
  // colors under them, and as colors of their own they painted a band of a color Arc hides
  return gradientStopPositions(MAX_THEME_COLORS).map((position) =>
    opaqueRgbOf(over(gradientAt(overlay, position), gradientAt(base, position))),
  )
}

const mappedOr = (value: unknown, map: (factor: number) => number, fallback: number) =>
  Option.match(decodeUnitInterval(value), { onNone: () => fallback, onSome: map })

const intensityOfArc = (factor: number) =>
  INTENSITY_AT_NO_ARC_INTENSITY + factor * (1 - INTENSITY_AT_NO_ARC_INTENSITY)

const grainOfArc = (factor: number) => factor * GRAIN_PER_ARC_NOISE

/** The first of `appearances` that is `light` or `dark`, else `auto`. */
const modeOf = (appearances: ReadonlyArray<unknown>): ThemeMode =>
  Option.getOrElse(
    Option.firstSomeOf(appearances.map((appearance) => decodeScheme(appearance))),
    (): ThemeMode => "auto",
  )

const gradientThemeOf = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.flatMap(decodeGradientTheme(customInfo), (decoded) => {
    const single = decoded.windowTheme.background.single._0
    const gradient = single.style.color._0.blendedGradient._0
    const colors = shownColors(
      colorsIn(gradient.baseColors),
      colorsIn(gradient.overlayColors ?? []),
    ).map(themeColorOfSrgb)
    return Option.liftPredicate(
      {
        mode: modeOf([single.contentOverBackgroundAppearance, gradient.translucencyStyle]),
        colors,
        intensity: mappedOr(gradient.modifiers?.intensityFactor, intensityOfArc, DEFAULT_INTENSITY),
        grain: mappedOr(gradient.modifiers?.noiseFactor, grainOfArc, DEFAULT_GRAIN),
        texture: DEFAULT_TEXTURE,
      } satisfies SpaceTheme,
      (theme) => theme.colors.length > 0,
    )
  })

const paletteThemeOf = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.map(decodePaletteTheme(customInfo), ({ windowTheme }) =>
    themeOf([themeColorOfSrgb(rgbOf(windowTheme.primaryColorPalette.midTone))]),
  )

// Colors that come out as the same Katip color would make a gradient of one color, which looks
// solid but shows as several colors in the theme picker
const sameColor = (a: ThemeColor, b: ThemeColor) => a.hue === b.hue && a.chroma === b.chroma

const withDistinctColors = (theme: SpaceTheme): SpaceTheme => ({
  ...theme,
  colors: Array.dedupeWith(theme.colors, sameColor).slice(0, MAX_THEME_COLORS),
})

/**
 * The Katip theme closest to an Arc Space's theme, read from the Space's `customInfo`.
 *
 * @remarks
 * The gradient's base colors become the theme's colors. A gradient with a visible overlay becomes
 * as many colors as a theme holds, each what Arc shows with the overlay laid over the base colors.
 * The gradient's intensity and noise, scaled to look alike, become the theme's intensity and grain,
 * and the light or dark appearance Arc paints it with becomes the theme's mode. A theme without a
 * gradient falls back to the main color of its palette, following the system's light or dark
 * scheme.
 *
 * @returns `None` when the Space has no theme Katip can read.
 */
export const themeOfArcSpace = (customInfo: unknown): Option.Option<SpaceTheme> =>
  Option.map(
    Option.orElse(gradientThemeOf(customInfo), () => paletteThemeOf(customInfo)),
    (theme) => withDistinctColors(settleTheme(theme)),
  )
