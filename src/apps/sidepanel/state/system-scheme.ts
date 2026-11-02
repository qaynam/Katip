import type { ColorScheme } from "#modules/theme"

// jsdom has no matchMedia, so the scheme is treated as light there
const darkSchemeQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null

export const currentSystemScheme = (): ColorScheme =>
  darkSchemeQuery()?.matches === true ? "dark" : "light"

/**
 * Notifies on every switch between the OS light and dark schemes. Call the returned function to
 * stop watching.
 */
export const watchSystemScheme = (onChange: (scheme: ColorScheme) => void): (() => void) => {
  const query = darkSchemeQuery()
  if (query === null) return () => {}
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
