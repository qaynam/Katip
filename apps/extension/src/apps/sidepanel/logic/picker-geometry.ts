import { Number, Option } from "effect"
import type { PickerPoint } from "#modules/theme"
import type { Point, Size } from "./menu-position"

// The mode switch overlaps the top of the field and the add/remove color buttons overlap the
// bottom. The circle's edge sits inside those button bands so that the dot never ends up under
// a button, even on the most saturated color (the edge)
export const FIELD_EDGE_INSET_PX = 56

const fieldRadius = (field: Size) =>
  Math.max(1, Math.min(field.width, field.height) / 2 - FIELD_EDGE_INSET_PX)

/**
 * Converts an offset from the field's top-left corner into picker circle coordinates (origin
 * at the center, y pointing up).
 */
export const pickerPointAt = (offset: Point, field: Size): PickerPoint => {
  const radius = fieldRadius(field)
  return {
    x: (offset.x - field.width / 2) / radius,
    y: (field.height / 2 - offset.y) / radius,
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
