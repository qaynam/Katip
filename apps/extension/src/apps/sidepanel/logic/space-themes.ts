import { Array, Option, pipe, Schema } from "effect"
import {
  appearanceOf,
  applyPreset,
  neutralTheme,
  presetPages,
  swatchOf,
  themeOf,
  ThemeColor,
  type SpaceTheme,
  type ThemePreset,
} from "#modules/theme"

/**
 * CSS background that paints a theme's colors as a small swatch. A theme without colors has no
 * swatch.
 */
export const themeSwatch = (colors: ReadonlyArray<ThemeColor>): Option.Option<string> =>
  Array.match(colors, {
    onEmpty: () => Option.none(),
    onNonEmpty: ([primary, ...rest]) =>
      Option.some(
        rest.length === 0
          ? swatchOf(primary)
          : `linear-gradient(135deg, ${[primary, ...rest].map(swatchOf).join(", ")})`,
      ),
  })

/**
 * CSS background for a preset's swatch: its colors, or for a gray, the background it paints, since
 * a gray's shade comes from the scheme and intensity rather than from a color.
 */
export const presetSwatch = (preset: ThemePreset): string =>
  preset._tag === "Colors"
    ? Option.getOrElse(themeSwatch(preset.colors), () => swatchOf({ hue: 0, chroma: 0 }))
    : appearanceOf(applyPreset(neutralTheme, preset), preset.mode).background

const sameColors = Schema.toEquivalence(Schema.Array(ThemeColor))

// New Spaces start with a colorful theme so they are easy to tell apart. Near-neutral presets
// are not suggested because they look the same as the default theme
const colorfulPresets = (presetPages[0] ?? []).flatMap((preset) =>
  preset._tag === "Colors" && (preset.colors[0]?.chroma ?? 0) > 0.2 ? [preset.colors] : [],
)

export const suggestedTheme = (
  spaces: ReadonlyArray<{ readonly theme: SpaceTheme }>,
): SpaceTheme => {
  const isUsed = (colors: ReadonlyArray<ThemeColor>) =>
    spaces.some((space) => sameColors(space.theme.colors, colors))
  const colors = pipe(
    Array.findFirst(colorfulPresets, (preset) => !isUsed(preset)),
    Option.orElse(() => Array.get(colorfulPresets, spaces.length % colorfulPresets.length)),
    Option.getOrElse((): ReadonlyArray<ThemeColor> => []),
  )
  return themeOf(colors)
}
