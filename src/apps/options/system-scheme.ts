import type { ColorScheme } from "#modules/theme"

// jsdom in tests has no matchMedia; treat its absence as light
const darkSchemeQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null

export const currentSystemScheme = (): ColorScheme =>
  darkSchemeQuery()?.matches === true ? "dark" : "light"

/** Calls back whenever the OS switches between light and dark. Call the returned function to stop. */
export const watchSystemScheme = (onChange: (scheme: ColorScheme) => void): (() => void) => {
  const query = darkSchemeQuery()
  if (query === null) return () => {}
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
