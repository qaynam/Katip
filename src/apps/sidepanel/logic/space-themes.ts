import { Array, Option, pipe, Schema } from "effect"
import { presetPages, swatchOf, themeOf, ThemeColor, type SpaceTheme } from "#modules/theme"

/** テーマの色を小さな見本として塗る CSS の背景。色の無いテーマには見本が無い。 */
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

// 新しい Space は見分けがつくよう色の付いたテーマで始める。無彩色に近いプリセットは
// 既定のテーマと見分けがつかないので勧めない
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
 * 色フィールドの点の格子を、その位置で選ばれる色にうっすら染めるための CSS の背景。
 * 中心ほど無彩色に近づく。
 */
export const hueWheelBackground = (): string => {
  // ピッカーの色相は右から反時計回り（画面の上が 90 度）に増えるが、conic-gradient は
  // 時計回りに描く。右から時計回りに進むほど色相が減るように並べる
  const stops = Array.makeBy(360 / WHEEL_STEP_DEGREES + 1, (step) => {
    const angle = step * WHEEL_STEP_DEGREES
    return `${swatchOf({ hue: (360 - angle) % 360, chroma: 1 })} ${angle}deg`
  })
  const center = swatchOf({ hue: 0, chroma: 0 })
  return `radial-gradient(circle closest-side, ${center}, transparent), conic-gradient(from 90deg, ${stops.join(", ")})`
}
