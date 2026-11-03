import { Array, Number } from "effect"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

/** A point in the picker's circle. The center is (0, 0), the radius 1, and y points up. */
export interface PickerPoint {
  readonly x: number
  readonly y: number
}

const normalizeHue = (degrees: number) => ((degrees % 360) + 360) % 360

/** A point outside the circle gives the color on the edge in the same direction. */
export const colorAtPoint = ({ x, y }: PickerPoint): ThemeColor => ({
  hue: normalizeHue((Math.atan2(y, x) * 180) / Math.PI),
  chroma: Number.clamp(Math.hypot(x, y), { minimum: 0, maximum: 1 }),
})

export const pointOfColor = ({ hue, chroma }: ThemeColor): PickerPoint => {
  const radians = (hue * Math.PI) / 180
  return { x: chroma * Math.cos(radians), y: chroma * Math.sin(radians) }
}

// A new color is a harmony color, a fixed hue step away from the primary color, so the gradient
// starts from colors that work together even before the user picks a point
const HARMONY_STEP_DEGREES = 40

/**
 * Adds one color to the gradient. Returns the colors unchanged when they're already at the limit.
 *
 * A theme without colors gets one of moderate chroma, so it doesn't stand out too much.
 */
export const addHarmonyColor = (colors: ReadonlyArray<ThemeColor>): ReadonlyArray<ThemeColor> => {
  if (colors.length >= MAX_THEME_COLORS) return colors
  return Array.match(colors, {
    onEmpty: () => [{ hue: 300, chroma: 0.6 }],
    onNonEmpty: ([primary]) => {
      const direction = colors.length % 2 === 1 ? 1 : -1
      return [
        ...colors,
        {
          hue: normalizeHue(primary.hue + direction * HARMONY_STEP_DEGREES),
          chroma: primary.chroma,
        },
      ]
    },
  })
}

/** Removes the last added color. The primary color is never removed. */
export const removeLastColor = (colors: ReadonlyArray<ThemeColor>): ReadonlyArray<ThemeColor> =>
  colors.length <= 1 ? colors : colors.slice(0, -1)
