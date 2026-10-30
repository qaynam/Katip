import { Array, Match } from "effect"
import { contrastRatio, rgbCss, toSrgb, type Rgb } from "./oklch"
import type { SpaceTheme, ThemeColor, ThemeMode } from "./space-theme"

export type ColorScheme = "light" | "dark"

/** テーマを画面に塗るための値。CSS にそのまま渡せる文字列で持つ。 */
export interface ThemeAppearance {
  readonly scheme: ColorScheme
  /** サイドバー全体の背景。2 色以上ならグラデーション。 */
  readonly background: string
  /** 背景の明るさから選んだ文字色。 */
  readonly text: string
  readonly mutedText: string
  /** 行にマウスを乗せたときの面。 */
  readonly hoverSurface: string
  /** アクティブなタブの行や Favorites のタイルなど、背景から浮かせる面。 */
  readonly raisedSurface: string
  readonly activeSurface: string
  readonly divider: string
  /** フォルダのアイコンなど、テーマの色そのものを見せる小さな要素の色。 */
  readonly accent: string
  readonly grainOpacity: number
}

export const resolveScheme = (mode: ThemeMode, system: ColorScheme): ColorScheme =>
  mode === "auto" ? system : mode

// 明るさは背景として文字が読める範囲に固定し、強さでは主に彩度を動かす。
// 強さで明るさまで大きく動かすと、同じテーマでも文字色が白黒で入れ替わってしまう
const backgroundTone = (color: ThemeColor, scheme: ColorScheme, intensity: number) =>
  Match.value(scheme).pipe(
    Match.when("light", () => ({
      lightness: 0.94 - 0.16 * intensity,
      chroma: color.chroma * (0.015 + 0.13 * intensity),
      hue: color.hue,
    })),
    Match.when("dark", () => ({
      lightness: 0.2 + 0.07 * intensity,
      chroma: color.chroma * (0.015 + 0.09 * intensity),
      hue: color.hue,
    })),
    Match.exhaustive,
  )

const neutral: ThemeColor = { hue: 280, chroma: 0.1 }

const white: Rgb = { red: 1, green: 1, blue: 1 }
const ink: Rgb = { red: 0.11, green: 0.11, blue: 0.12 }

const averageRgb = (colors: Array.NonEmptyReadonlyArray<Rgb>): Rgb => ({
  red: colors.reduce((sum, c) => sum + c.red, 0) / colors.length,
  green: colors.reduce((sum, c) => sum + c.green, 0) / colors.length,
  blue: colors.reduce((sum, c) => sum + c.blue, 0) / colors.length,
})

/**
 * テーマから、サイドバーを塗る色一式を求める。
 *
 * @param system - OS のライト／ダーク。テーマのモードが auto のときだけ使う。
 *
 * @remarks
 * 文字色はモードではなく実際の背景の明るさから選ぶ（コントラスト比の高いほう）。
 * ライトモードでも濃い色を選べば白い文字になる。
 */
export const appearanceOf = (theme: SpaceTheme, system: ColorScheme): ThemeAppearance => {
  const scheme = resolveScheme(theme.mode, system)
  const colors = Array.isReadonlyArrayNonEmpty(theme.colors) ? theme.colors : ([neutral] as const)
  const stops = Array.map(colors, (color) => toSrgb(backgroundTone(color, scheme, theme.intensity)))
  const isLightBackground =
    contrastRatio(averageRgb(stops), ink) >= contrastRatio(averageRgb(stops), white)
  const [first] = stops
  const background =
    stops.length === 1
      ? rgbCss(first)
      : `linear-gradient(165deg, ${stops.map((stop) => rgbCss(stop)).join(", ")})`
  const accentColor = Array.headNonEmpty(colors)
  return {
    scheme,
    background,
    text: isLightBackground ? rgbCss(ink, 0.88) : rgbCss(white, 0.92),
    mutedText: isLightBackground ? rgbCss(ink, 0.5) : rgbCss(white, 0.5),
    hoverSurface: isLightBackground ? rgbCss(white, 0.3) : rgbCss(white, 0.06),
    raisedSurface: isLightBackground ? rgbCss(white, 0.42) : rgbCss(white, 0.09),
    activeSurface: isLightBackground ? rgbCss(white, 0.82) : rgbCss(white, 0.17),
    divider: isLightBackground ? rgbCss(ink, 0.12) : rgbCss(white, 0.12),
    accent: rgbCss(
      toSrgb({
        lightness: isLightBackground ? 0.55 : 0.72,
        chroma: Math.max(accentColor.chroma, 0.35) * 0.17,
        hue: accentColor.hue,
      }),
    ),
    grainOpacity: theme.grain * 0.35,
  }
}

/** ピッカーの点やスイッチャーの印など、テーマの色そのものを見せる見本の色。 */
export const swatchOf = (color: ThemeColor): string =>
  rgbCss(toSrgb({ lightness: 0.74, chroma: color.chroma * 0.17, hue: color.hue }))
