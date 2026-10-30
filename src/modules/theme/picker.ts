import { Array, Number } from "effect"
import { MAX_THEME_COLORS, type ThemeColor } from "./space-theme"

/** ピッカーの円の中の位置。中心が (0, 0)、半径 1。y は上向き。 */
export interface PickerPoint {
  readonly x: number
  readonly y: number
}

const normalizeHue = (degrees: number) => ((degrees % 360) + 360) % 360

/** 円の外を指した場合は、同じ方向の縁の色として扱う。 */
export const colorAtPoint = ({ x, y }: PickerPoint): ThemeColor => ({
  hue: normalizeHue((Math.atan2(y, x) * 180) / Math.PI),
  chroma: Number.clamp(Math.hypot(x, y), { minimum: 0, maximum: 1 }),
})

export const pointOfColor = ({ hue, chroma }: ThemeColor): PickerPoint => {
  const radians = (hue * Math.PI) / 180
  return { x: chroma * Math.cos(radians), y: chroma * Math.sin(radians) }
}

// 新しく足す色は、主色から色相を一定量ずらした調和色にする。ユーザーが位置を
// 選ぶ前でもグラデーションとして破綻しない色から始められる
const HARMONY_STEP_DEGREES = 40

/**
 * グラデーションに色を 1 つ足す。上限に達していれば何もしない。
 *
 * 無彩色のテーマには、目立ちすぎない中程度の彩度の色を足す。
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

/** 最後に足した色を取り除く。主色だけになったら、それ以上は取り除かない。 */
export const removeLastColor = (colors: ReadonlyArray<ThemeColor>): ReadonlyArray<ThemeColor> =>
  colors.length <= 1 ? colors : colors.slice(0, -1)
