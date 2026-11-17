/**
 * The languages PRIVACY.md is written in, in the order its translations come. The rest of the
 * site is in English only.
 */
export const LANGUAGES = ["en", "ja"] as const

export type Language = (typeof LANGUAGES)[number]

/** Each language's name in that language, as a link to its translation offers it. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: "English", ja: "日本語" }

/** The `og:locale` of each language. */
export const OPEN_GRAPH_LOCALES: Readonly<Record<Language, string>> = { en: "en_US", ja: "ja_JP" }
