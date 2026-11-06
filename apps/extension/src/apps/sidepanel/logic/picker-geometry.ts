import { Number, Option } from "effect"
import type { PickerPoint } from "#modules/theme"
import type { Point, Size } from "./menu-position"

// A dot's center stops this far in from the field's edge, so even the large primary dot stays whole
// inside the field
export const FIELD_EDGE_INSET_PX = 20

/** Half the width and height of the rectangle that dot centers can reach. */
const reachOf = (field: Size) => ({
  x: Math.max(1, field.width / 2 - FIELD_EDGE_INSET_PX),
  y: Math.max(1, field.height / 2 - FIELD_EDGE_INSET_PX),
})

/** How far `direction` (a unit vector) can go from the field's center before leaving the reach. */
const reachAlong = (direction: PickerPoint, field: Size) => {
  const reach = reachOf(field)
  return 1 / Math.max(Math.abs(direction.x) / reach.x, Math.abs(direction.y) / reach.y)
}

/**
 * Converts an offset from the field's top-left corner into a point of the picker circle (origin at
 * the center, y pointing up).
 *
 * The point keeps the offset's direction from the field's center, so the hue under the pointer is
 * the one the field's hue wheel shows there. Its distance from the center reaches 1 on the edge of
 * the rectangle dots can reach, so the most vivid colors lie along all four sides of the field and
 * in its corners.
 */
export const pickerPointAt = (offset: Point, field: Size): PickerPoint => {
  const fromCenter = { x: offset.x - field.width / 2, y: field.height / 2 - offset.y }
  const distance = Math.hypot(fromCenter.x, fromCenter.y)
  if (distance === 0) return { x: 0, y: 0 }
  const direction = { x: fromCenter.x / distance, y: fromCenter.y / distance }
  const share = distance / reachAlong(direction, field)
  return { x: direction.x * share, y: direction.y * share }
}

/** Where the dot of `point` sits, as an offset from the field's top-left corner. */
export const fieldOffsetOf = (point: PickerPoint, field: Size): Point => {
  const share = Math.hypot(point.x, point.y)
  const direction = share === 0 ? { x: 0, y: 0 } : { x: point.x / share, y: point.y / share }
  const distance = share === 0 ? 0 : share * reachAlong(direction, field)
  return {
    x: field.width / 2 + direction.x * distance,
    y: field.height / 2 - direction.y * distance,
  }
}

const unit = (value: number) => Number.clamp(value, { minimum: 0, maximum: 1 })

export interface SliderTrack {
  readonly length: number
  readonly thumbLength: number
}

/** 0 when the thumb's center is at the left end of the track, 1 at the right end. */
export const sliderValueAt = (offset: number, track: SliderTrack): number => {
  const travel = Math.max(1, track.length - track.thumbLength)
  return unit((offset - track.thumbLength / 2) / travel)
}

const clockwiseTurnFromTop = ({ x, y }: Point) => {
  const degrees = (Math.atan2(x, -y) * 180) / Math.PI
  return (((degrees % 360) + 360) % 360) / 360
}

/**
 * Turns the pointer position around the dial's center into a value: 0 straight up, 1 after a
 * full clockwise turn.
 *
 * @param offset - Position relative to the dial's center, in screen coordinates (y pointing
 *   down).
 * @param previous - The previous value. Decides which end to stop at when the pointer crosses
 *   the seam where a full turn wraps around.
 */
export const dialValueAt = (offset: Point, previous: number): number => {
  const value = clockwiseTurnFromTop(offset)
  const hasCrossedSeam = Math.abs(value - previous) > 0.5
  if (hasCrossedSeam) return previous > 0.5 ? 1 : 0
  return value
}

const KEY_STEP = 0.05

const roundToHundredths = (value: number) => Math.round(value * 100) / 100

/** The slider or dial value after a key press, or None for keys that don't adjust it. */
export const valueAfterKey = (value: number, key: string): Option.Option<number> => {
  const next: Partial<Record<string, number>> = {
    ArrowRight: value + KEY_STEP,
    ArrowUp: value + KEY_STEP,
    ArrowLeft: value - KEY_STEP,
    ArrowDown: value - KEY_STEP,
    Home: 0,
    End: 1,
  }
  return Option.fromUndefinedOr(next[key]).pipe(
    Option.map((moved) => unit(roundToHundredths(moved))),
  )
}

/** The color dot's position after a key press, or None for keys that don't move it. */
export const pointAfterKey = (point: PickerPoint, key: string): Option.Option<PickerPoint> => {
  const next: Partial<Record<string, PickerPoint>> = {
    ArrowRight: { x: point.x + KEY_STEP, y: point.y },
    ArrowLeft: { x: point.x - KEY_STEP, y: point.y },
    ArrowUp: { x: point.x, y: point.y + KEY_STEP },
    ArrowDown: { x: point.x, y: point.y - KEY_STEP },
  }
  return Option.fromUndefinedOr(next[key])
}
