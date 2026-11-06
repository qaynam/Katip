import { Array, Match, Number } from "effect"
import { contrastRatio, cuspOf, fromSrgb, rgbCss, toSrgb, type Oklch, type Rgb } from "./oklch"
import type { SpaceTheme, ThemeColor, ThemeMode } from "./space-theme"
import { textureTileOf } from "./textures"

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
  /** The color of small elements that show the theme's color itself, such as a text caret. */
  readonly accent: string
  /** The folder icon's tab, in the theme's color at its most vivid. */
  readonly folderTab: string
  /** The inside of the folder icon, a pale tint of the theme's color. */
  readonly folderFill: string
  /** The folder icon's outline and the icon chosen for a folder, drawn inside it. */
  readonly folderLine: string
  /** The texture's tile, a CSS `url()`, repeated at {@link grainTileSize} over the background. */
  readonly grainImage: string
  readonly grainTileSize: string
  readonly grainOpacity: number
}

export const resolveScheme = (mode: ThemeMode, system: ColorScheme): ColorScheme =>
  mode === "auto" ? system : mode

/**
 * The color a share of the way from an achromatic color of lightness `base` to the most vivid
 * color of `hue`.
 */
const towardCusp = (base: number, hue: number, share: number): Oklch => {
  const cusp = cuspOf(hue)
  return {
    lightness: base + share * (cusp.lightness - base),
    chroma: share * cusp.chroma,
    hue,
  }
}

/** The highest chroma sRGB can show at `lightness` in `hue`, on a straight line to its cusp. */
const maxChromaAt = (lightness: number, hue: number) => {
  const cusp = cuspOf(hue)
  return lightness <= cusp.lightness
    ? (cusp.chroma * lightness) / cusp.lightness
    : (cusp.chroma * (1 - lightness)) / (1 - cusp.lightness)
}

// The light scheme was fitted to the sidebar Arc paints, sampled from a screen recording and from
// screenshots: the same lightness for every hue, falling from about 0.92 for a color at the picker's
// edge to about 0.66 for one at its center, with the chroma that share of the hue's most vivid
// color. Lower intensity lets less of the color through, as Arc's translucency does. The dark scheme
// keeps the lightness in a narrow band, so white text stays readable on every hue
const backgroundTone = (color: ThemeColor, scheme: ColorScheme, intensity: number): Oklch =>
  Match.value(scheme).pipe(
    Match.when("light", () => {
      const share = color.chroma * (0.1 + 0.9 * intensity)
      const lightness = 0.92 - 0.26 * share
      return {
        lightness,
        chroma: Math.min(share * cuspOf(color.hue).chroma, maxChromaAt(lightness, color.hue)),
        hue: color.hue,
      }
    }),
    Match.when("dark", () => ({
      lightness: 0.22 + 0.09 * intensity,
      chroma: color.chroma * (0.02 + 0.12 * intensity),
      hue: color.hue,
    })),
    Match.exhaustive,
  )

interface FolderTones {
  readonly tab: Oklch
  readonly fill: Oklch
  readonly line: Oklch
}

const folderTones = (color: ThemeColor, scheme: ColorScheme): FolderTones => {
  // Not the theme color's own chroma: a pale primary color gave folders too faint to tell from the
  // background. The ramp tops out early so pale colors still get a clear tint, and starts from
  // zero so a grey theme keeps grey folders
  const vividness = Math.min(1, color.chroma * 4)
  const tone = (lightness: number, chroma: number): Oklch => ({
    lightness,
    chroma: vividness * chroma,
    hue: color.hue,
  })
  return Match.value(scheme).pipe(
    Match.when("light", () => ({
      tab: tone(0.76, 0.15),
      fill: tone(0.955, 0.045),
      line: tone(0.45, 0.1),
    })),
    Match.when("dark", () => ({
      tab: tone(0.7, 0.13),
      fill: tone(0.36, 0.04),
      line: tone(0.85, 0.07),
    })),
    Match.exhaustive,
  )
}

const neutral: ThemeColor = { hue: 280, chroma: 0.1 }

/**
 * Where each of a theme's colors sits along the background's gradient, from 0 at the top to 1 at
 * the bottom, for a theme of `count` colors.
 */
export const gradientStopPositions = (count: number): ReadonlyArray<number> =>
  // The first color gets a longer stretch so the primary color covers more of the background
  Array.makeBy(count, (index) =>
    index === 0 ? 0.15 : Math.round(40 + (60 * index) / (count - 1)) / 100,
  )

// Not interpolated in sRGB: halfway between complementary colors sinks into grey or mud. The
// gradient interpolates in perceptually uniform OKLab
const gradientStops = (colors: ReadonlyArray<string>) =>
  Array.zipWith(
    colors,
    gradientStopPositions(colors.length),
    (color, position) => `${color} ${Math.round(position * 100)}%`,
  ).join(", ")

const white: Rgb = { red: 1, green: 1, blue: 1 }
const ink: Rgb = { red: 0.11, green: 0.11, blue: 0.12 }

const averageRgb = (colors: Array.NonEmptyReadonlyArray<Rgb>): Rgb => ({
  red: colors.reduce((sum, c) => sum + c.red, 0) / colors.length,
  green: colors.reduce((sum, c) => sum + c.green, 0) / colors.length,
  blue: colors.reduce((sum, c) => sum + c.blue, 0) / colors.length,
})

const css = (color: Oklch) => rgbCss(toSrgb(color))

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
  const primary = Array.headNonEmpty(colors)
  const folder = folderTones(primary, scheme)
  const texture = textureTileOf(theme.texture)
  return {
    scheme,
    background,
    text: isLightBackground ? rgbCss(ink, 0.88) : rgbCss(white, 0.92),
    mutedText: isLightBackground ? rgbCss(ink, 0.5) : rgbCss(white, 0.5),
    hoverSurface: isLightBackground ? rgbCss(white, 0.3) : rgbCss(white, 0.06),
    raisedSurface: isLightBackground ? rgbCss(white, 0.42) : rgbCss(white, 0.09),
    activeSurface: isLightBackground ? rgbCss(white, 0.82) : rgbCss(white, 0.17),
    divider: isLightBackground ? rgbCss(ink, 0.12) : rgbCss(white, 0.12),
    accent: css({
      lightness: isLightBackground ? 0.55 : 0.72,
      chroma: Math.max(primary.chroma, 0.35) * 0.17,
      hue: primary.hue,
    }),
    folderTab: css(folder.tab),
    folderFill: css(folder.fill),
    folderLine: css(folder.line),
    grainImage: texture.image,
    grainTileSize: `${texture.sizePx}px ${texture.sizePx}px`,
    // Capped so that even at the dial's maximum, faint text doesn't drown in the texture
    grainOpacity: Math.min(1, theme.grain * 0.6 * texture.strength),
  }
}

// Not white itself: the palest swatches would vanish against a white page
const SWATCH_PALEST_LIGHTNESS = 0.97

/**
 * A swatch that shows a theme color itself, such as a picker dot or a switcher mark: chroma 0 is a
 * near-white, and chroma 1 the most vivid color of the hue that sRGB can show.
 */
export const swatchOf = (color: ThemeColor): string =>
  css(towardCusp(SWATCH_PALEST_LIGHTNESS, color.hue, color.chroma))

/**
 * The theme color whose swatch has `rgb`'s hue and colorfulness. Colors more vivid than a swatch
 * can show get the most vivid theme color of their hue.
 *
 * @remarks
 * Lightness is dropped: a theme color has none, as the scheme and intensity decide how light it's
 * painted.
 */
export const themeColorOfSrgb = (rgb: Rgb): ThemeColor => {
  const { chroma, hue } = fromSrgb(rgb)
  return {
    hue,
    chroma: Number.clamp(chroma / cuspOf(hue).chroma, { minimum: 0, maximum: 1 }),
  }
}
