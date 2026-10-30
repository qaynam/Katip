import { Number, Option } from "effect"
import type { PickerPoint } from "#modules/theme"
import type { Point, Size } from "./menu-position"

// フィールドの上端にはモードの切替、下端には色の増減のボタンが重なっている。最も鮮やかな色
// （円の縁）を選んでも色の点がそれらのボタンに被らないよう、ボタンの帯より内側を円の縁にする
export const FIELD_EDGE_INSET_PX = 56

const fieldRadius = (field: Size) =>
  Math.max(1, Math.min(field.width, field.height) / 2 - FIELD_EDGE_INSET_PX)

/** フィールドの左上からの位置を、ピッカーの円の座標（中心が原点、y は上向き）に換算する。 */
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

/** つまみの中心がトラックの左端にあるとき 0、右端にあるとき 1。 */
export const sliderValueAt = (offset: number, track: SliderTrack): number => {
  const travel = Math.max(1, track.length - track.thumbLength)
  return unit((offset - track.thumbLength / 2) / travel)
}

const clockwiseTurnFromTop = ({ x, y }: Point) => {
  const degrees = (Math.atan2(x, -y) * 180) / Math.PI
  return (((degrees % 360) + 360) % 360) / 360
}

/**
 * ダイヤルの中心から見た指の位置を値にする。真上が 0 で、時計回りに一周すると 1。
 *
 * @param offset - ダイヤルの中心からの位置（画面の座標で、y は下向き）
 * @param previous - 直前の値。一周の継ぎ目をまたいだときに、どちらの端で止めるかを決める
 */
export const dialValueAt = (offset: Point, previous: number): number => {
  const value = clockwiseTurnFromTop(offset)
  const hasCrossedSeam = Math.abs(value - previous) > 0.5
  if (hasCrossedSeam) return previous > 0.5 ? 1 : 0
  return value
}

const KEY_STEP = 0.05

const roundToHundredths = (value: number) => Math.round(value * 100) / 100

/** スライダーやダイヤルをキーボードで動かしたあとの値。調整に使わないキーなら None。 */
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

/** 色の点をキーボードで動かしたあとの位置。調整に使わないキーなら None。 */
export const pointAfterKey = (point: PickerPoint, key: string): Option.Option<PickerPoint> => {
  const next: Partial<Record<string, PickerPoint>> = {
    ArrowRight: { x: point.x + KEY_STEP, y: point.y },
    ArrowLeft: { x: point.x - KEY_STEP, y: point.y },
    ArrowUp: { x: point.x, y: point.y + KEY_STEP },
    ArrowDown: { x: point.x, y: point.y - KEY_STEP },
  }
  return Option.fromUndefinedOr(next[key])
}
