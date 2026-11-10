import type { ColorScheme } from "#modules/theme"

// The test environment (jsdom) has no matchMedia, so there the scheme counts as light
const darkSchemeQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null

export const currentSystemScheme = (): ColorScheme =>
  darkSchemeQuery()?.matches === true ? "dark" : "light"

/** Reports every switch between the OS's light and dark. Calling the returned function stops it. */
export const watchSystemScheme = (onChange: (scheme: ColorScheme) => void): (() => void) => {
  const query = darkSchemeQuery()
  if (query === null) return () => {}
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
