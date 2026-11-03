import {
  appearanceOf,
  type ColorScheme,
  neutralTheme,
  type SpaceTheme,
  type ThemeAppearance,
} from "#modules/theme"

// Not as strong as the side panel: on a small window floating over the page, that would be too loud
const MAX_INTENSITY = 0.4

/**
 * Spotlight's colors: a faint version of the theme of the Space in the window that opened it.
 *
 * @remarks
 * Light or dark follows the theme's mode, as in the side panel; an automatic theme follows the OS.
 */
export const spotlightAppearance = (
  theme: SpaceTheme | null,
  system: ColorScheme,
): ThemeAppearance => {
  const base = theme ?? neutralTheme
  return appearanceOf({ ...base, intensity: Math.min(base.intensity, MAX_INTENSITY) }, system)
}
