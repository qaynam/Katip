import { Array, Number } from "effect"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

/** A point in the picker's circle. The center is (0, 0), the radius 1, and y points up. */
export interface PickerPoint {
  readonly x: number
  readonly y: number
}

const normalizeHue = (degrees: number) => ((degrees % 360) + 360) % 360

/** The signed turn from hue `from` to hue `to`, from -180 to 180 degrees. */
const hueTurn = (from: number, to: number) => normalizeHue(to - from + 180) - 180

// OKLCH's hue for sRGB red. It sits at the right of the circle and hues run clockwise, which lays
// the circle out the way color wheels usually are: yellow lower right, green lower left, blue
// upper left
const HUE_AT_RIGHT = 29

/** A point outside the circle gives the color on the edge in the same direction. */
export const colorAtPoint = ({ x, y }: PickerPoint): ThemeColor => ({
  hue: normalizeHue(HUE_AT_RIGHT - (Math.atan2(y, x) * 180) / Math.PI),
  chroma: Number.clamp(Math.hypot(x, y), { minimum: 0, maximum: 1 }),
})

export const pointOfColor = ({ hue, chroma }: ThemeColor): PickerPoint => {
  const radians = ((HUE_AT_RIGHT - hue) * Math.PI) / 180
  return { x: chroma * Math.cos(radians), y: chroma * Math.sin(radians) }
}

/**
 * The colors after the color at `index` is moved to `to`. The colors move together, as one
 * harmony, and all take the moved color's chroma.
 *
 * Moving the primary color turns the others with it, keeping their hue offsets. Moving another
 * color sets how far the colors spread from the primary color: the second color on one side and
 * the third mirrored on the other.
 */
export const moveColor = (
  colors: ReadonlyArray<ThemeColor>,
  index: number,
  to: ThemeColor,
): ReadonlyArray<ThemeColor> =>
  Array.match(colors, {
    onEmpty: () => [to],
    onNonEmpty: ([primary]) => {
      if (index === 0) {
        const turn = hueTurn(primary.hue, to.hue)
        return colors.map((color) => ({ hue: normalizeHue(color.hue + turn), chroma: to.chroma }))
      }
      const spread = hueTurn(primary.hue, to.hue) * (index === 1 ? 1 : -1)
      return colors.map((_, position) => ({
        hue: normalizeHue(primary.hue + (position === 0 ? 0 : position === 1 ? spread : -spread)),
        chroma: to.chroma,
      }))
    },
  })

// A new color is a harmony color, a fixed hue step away from the primary color, so the gradient
// starts from colors that work together even before the user picks a point
const HARMONY_STEP_DEGREES = 40

/**
 * Adds one color to the gradient. Returns the colors unchanged when they're already at the limit.
 *
 * The second color is a fixed hue step from the primary color, and the third mirrors the second on
 * the other side of it, all at the primary color's chroma. A theme without colors gets one of
 * moderate chroma, so it doesn't stand out too much.
 */
export const addHarmonyColor = (colors: ReadonlyArray<ThemeColor>): ReadonlyArray<ThemeColor> => {
  if (colors.length >= MAX_THEME_COLORS) return colors
  return Array.match(colors, {
    onEmpty: () => [{ hue: 300, chroma: 0.6 }],
    onNonEmpty: ([primary, second]) => {
      const spread = second === undefined ? 0 : hueTurn(primary.hue, second.hue)
      const offset = second === undefined || spread === 0 ? HARMONY_STEP_DEGREES : -spread
      return [...colors, { hue: normalizeHue(primary.hue + offset), chroma: primary.chroma }]
    },
  })
}

/** Removes the last added color. The primary color is never removed. */
export const removeLastColor = (colors: ReadonlyArray<ThemeColor>): ReadonlyArray<ThemeColor> =>
  colors.length <= 1 ? colors : colors.slice(0, -1)
