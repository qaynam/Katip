import {
  appearanceOf,
  type ColorScheme,
  neutralTheme,
  type SpaceTheme,
  type ThemeAppearance,
} from "#modules/theme"

// サイドパネルほど濃く塗ると、ページの上に浮かぶ小さな窓としては主張が強すぎる
const MAX_INTENSITY = 0.4

/**
 * Spotlight を塗る色。開いたウィンドウの Space のテーマをほのかに使う。
 *
 * @remarks
 * ライト／ダークはテーマのモードによらず OS に従う。
 */
export const spotlightAppearance = (
  theme: SpaceTheme | null,
  system: ColorScheme,
): ThemeAppearance => {
  const base = theme ?? neutralTheme
  return appearanceOf(
    { ...base, mode: "auto", intensity: Math.min(base.intensity, MAX_INTENSITY) },
    system,
  )
}
