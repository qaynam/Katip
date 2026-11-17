import type { Language } from "./languages.ts"
import { SITE_URL } from "./site.ts"

/** The site's pages, which are all in English apart from the privacy policy's translation. */
export const PATHS = {
  home: "/",
  features: "/#features",
  arc: "/#arc",
  whatsNew: "/whats-new/",
  privacy: "/privacy/",
} as const

/** The path of the privacy policy in each language PRIVACY.md is written in. */
export const PRIVACY_PATHS: Readonly<Record<Language, string>> = {
  en: PATHS.privacy,
  ja: "/ja/privacy/",
}

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href
