import { Array, Option, pipe, Schema } from "effect"
import { presetPages, swatchOf, themeOf, ThemeColor, type SpaceTheme } from "#modules/theme"

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

const sameColors = Schema.toEquivalence(Schema.Array(ThemeColor))

// New Spaces start with a colorful theme so they are easy to tell apart. Near-neutral presets
// are not suggested because they look the same as the default theme
const colorfulPresets = pipe(
  presetPages[0] ?? [],
  Array.filter(([primary]) => primary !== undefined && primary.chroma > 0.2),
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

const WHEEL_STEP_DEGREES = 30

/**
 * CSS background that faintly tints the color field's dot grid with the color picked at each
 * position. It fades toward neutral at the center.
 */
export const hueWheelBackground = (): string => {
  // The picker's hue grows counterclockwise from the right (90 degrees at the top), but
  // conic-gradient draws clockwise, so the stops start at the right with decreasing hue
  const stops = Array.makeBy(360 / WHEEL_STEP_DEGREES + 1, (step) => {
    const angle = step * WHEEL_STEP_DEGREES
    return `${swatchOf({ hue: (360 - angle) % 360, chroma: 1 })} ${angle}deg`
  })
  const center = swatchOf({ hue: 0, chroma: 0 })
  return `radial-gradient(circle closest-side, ${center}, transparent), conic-gradient(from 90deg, ${stops.join(", ")})`
}
