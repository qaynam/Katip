import { Schema } from "effect"

const unitInterval = Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })))

/** auto は OS のライト／ダークに従う。 */
export const ThemeMode = Schema.Literals(["auto", "light", "dark"])
export type ThemeMode = typeof ThemeMode.Type

/**
 * テーマを構成する 1 色。ピッカーの円の中の位置そのもので、角度が色相、中心からの距離が彩度になる。
 * 実際に塗る明るさや濃さは、ライト／ダークと強さから決まる。
 */
export const ThemeColor = Schema.Struct({
  hue: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 360 }))),
  chroma: unitInterval,
})
export type ThemeColor = typeof ThemeColor.Type

export const MAX_THEME_COLORS = 3

export const SpaceTheme = Schema.Struct({
  mode: ThemeMode,
  /** 空なら無彩色。2 色以上ならグラデーションになる。先頭が主色。 */
  colors: Schema.Array(ThemeColor).pipe(Schema.check(Schema.isMaxLength(MAX_THEME_COLORS))),
  /** 色の濃さ。0 でほぼ無彩色、1 で最も鮮やか。 */
  intensity: unitInterval,
  /** 背景に重ねる粒状のノイズの強さ。 */
  grain: unitInterval,
})
export type SpaceTheme = typeof SpaceTheme.Type

export const DEFAULT_INTENSITY = 0.7
export const DEFAULT_GRAIN = 0.2

export const themeOf = (colors: ReadonlyArray<ThemeColor>): SpaceTheme => ({
  mode: "auto",
  colors,
  intensity: DEFAULT_INTENSITY,
  grain: DEFAULT_GRAIN,
})

export const neutralTheme: SpaceTheme = themeOf([])
