import { Array, Match } from "effect"
import { contrastRatio, rgbCss, toSrgb, type Rgb } from "./oklch"
import type { SpaceTheme, ThemeColor, ThemeMode } from "./space-theme"

export type ColorScheme = "light" | "dark"

/** The values that paint a theme on screen, as strings ready to hand to CSS. */
export interface ThemeAppearance {
  readonly scheme: ColorScheme
  /** The background of the whole sidebar. A gradient with two or more colors. */
  readonly background: string
  /** The text color, picked from how light the background is. */
  readonly text: string
  readonly mutedText: string
  /** The surface of a row under the mouse. */
  readonly hoverSurface: string
  /** A surface raised from the background, such as the active tab's row or a Favorites tile. */
  readonly raisedSurface: string
  readonly activeSurface: string
  readonly divider: string
  /** The color of small elements that show the theme's color itself, such as folder icons. */
  readonly accent: string
  readonly grainOpacity: number
}

export const resolveScheme = (mode: ThemeMode, system: ColorScheme): ColorScheme =>
  mode === "auto" ? system : mode

// Lightness stays in a range where text on the background is readable, and intensity mostly moves
// chroma. Letting intensity move lightness far too would flip the text between black and white
// within one theme
const backgroundTone = (color: ThemeColor, scheme: ColorScheme, intensity: number) =>
  Match.value(scheme).pipe(
    Match.when("light", () => ({
      lightness: 0.94 - 0.16 * intensity,
      chroma: color.chroma * (0.015 + 0.13 * intensity),
      hue: color.hue,
    })),
    Match.when("dark", () => ({
      lightness: 0.22 + 0.09 * intensity,
      chroma: color.chroma * (0.02 + 0.12 * intensity),
      hue: color.hue,
    })),
    Match.exhaustive,
  )

const neutral: ThemeColor = { hue: 280, chroma: 0.1 }

// Not interpolated in sRGB: halfway between complementary colors sinks into grey or mud. The
// gradient interpolates in perceptually uniform OKLab, and the first color gets a longer stretch so
// the primary color covers more of it
const gradientStops = (colors: ReadonlyArray<string>) =>
  colors
    .map((color, index) =>
      index === 0
        ? `${color} 15%`
        : `${color} ${Math.round(40 + (60 * index) / (colors.length - 1))}%`,
    )
    .join(", ")

const white: Rgb = { red: 1, green: 1, blue: 1 }
const ink: Rgb = { red: 0.11, green: 0.11, blue: 0.12 }

const averageRgb = (colors: Array.NonEmptyReadonlyArray<Rgb>): Rgb => ({
  red: colors.reduce((sum, c) => sum + c.red, 0) / colors.length,
  green: colors.reduce((sum, c) => sum + c.green, 0) / colors.length,
  blue: colors.reduce((sum, c) => sum + c.blue, 0) / colors.length,
})

/**
 * Works out the full set of colors that paint the sidebar for a theme.
 *
 * @param system - The OS's light or dark scheme. Used only when the theme's mode is auto.
 *
 * @remarks
 * The text color is picked from the actual lightness of the background, not from the mode
 * (whichever has the higher contrast ratio). A deep color gives white text even in light mode.
 */
export const appearanceOf = (theme: SpaceTheme, system: ColorScheme): ThemeAppearance => {
  const scheme = resolveScheme(theme.mode, system)
  const colors = Array.isReadonlyArrayNonEmpty(theme.colors) ? theme.colors : ([neutral] as const)
  const stops = Array.map(colors, (color) => toSrgb(backgroundTone(color, scheme, theme.intensity)))
  const isLightBackground =
    contrastRatio(averageRgb(stops), ink) >= contrastRatio(averageRgb(stops), white)
  const [first] = stops
  const background =
    stops.length === 1
      ? rgbCss(first)
      : `linear-gradient(in oklab 170deg, ${gradientStops(stops.map((stop) => rgbCss(stop)))})`
  const accentColor = Array.headNonEmpty(colors)
  return {
    scheme,
    background,
    text: isLightBackground ? rgbCss(ink, 0.88) : rgbCss(white, 0.92),
    mutedText: isLightBackground ? rgbCss(ink, 0.5) : rgbCss(white, 0.5),
    hoverSurface: isLightBackground ? rgbCss(white, 0.3) : rgbCss(white, 0.06),
    raisedSurface: isLightBackground ? rgbCss(white, 0.42) : rgbCss(white, 0.09),
    activeSurface: isLightBackground ? rgbCss(white, 0.82) : rgbCss(white, 0.17),
    divider: isLightBackground ? rgbCss(ink, 0.12) : rgbCss(white, 0.12),
    accent: rgbCss(
      toSrgb({
        lightness: isLightBackground ? 0.55 : 0.72,
        chroma: Math.max(accentColor.chroma, 0.35) * 0.17,
        hue: accentColor.hue,
      }),
    ),
    // Capped so that even at the dial's maximum, faint text doesn't drown in the grain
    grainOpacity: theme.grain * 0.6,
  }
}

/** A swatch that shows a theme color itself, such as a picker dot or a switcher mark. */
export const swatchOf = (color: ThemeColor): string =>
  rgbCss(toSrgb({ lightness: 0.74, chroma: color.chroma * 0.17, hue: color.hue }))
