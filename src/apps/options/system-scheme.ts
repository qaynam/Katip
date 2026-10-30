import type { ColorScheme } from "#modules/theme"

// テスト環境（jsdom）には matchMedia が無い。その場合はライトとして扱う
const darkSchemeQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null

export const currentSystemScheme = (): ColorScheme =>
  darkSchemeQuery()?.matches === true ? "dark" : "light"

/** OS のライト／ダークが切り替わるたびに知らせる。返り値の関数を呼ぶと購読をやめる */
export const watchSystemScheme = (onChange: (scheme: ColorScheme) => void): (() => void) => {
  const query = darkSchemeQuery()
  if (query === null) return () => {}
  const listener = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}
