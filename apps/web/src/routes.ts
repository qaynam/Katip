import { LANGUAGES, type Language } from "./languages.ts"
import { SITE_URL } from "./site.ts"

/** The pages that exist in every language. */
export type Page = "home" | "privacy"

const PAGE_PATHS: Readonly<Record<Page, string>> = { home: "", privacy: "privacy/" }

/** The path of a page in one language, ending in the slash the site always uses. */
export const pathOf = (language: Language, page: Page) => `/${language}/${PAGE_PATHS[page]}`

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href

/** The other languages a page can be read in, for language switchers. */
export const otherLanguages = (language: Language) =>
  LANGUAGES.filter((other) => other !== language)
