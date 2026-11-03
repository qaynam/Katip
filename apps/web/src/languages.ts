export const LANGUAGES = ["en", "ja"] as const

export type Language = (typeof LANGUAGES)[number]

/** The language for visitors who prefer none of the site's languages. */
export const DEFAULT_LANGUAGE: Language = "en"

/** Each language's name in that language, as a language switcher offers it. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: "English", ja: "日本語" }

/** The `og:locale` of each language. */
export const OPEN_GRAPH_LOCALES: Readonly<Record<Language, string>> = { en: "en_US", ja: "ja_JP" }
