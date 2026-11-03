import { LANGUAGES, type Language } from "./languages.ts"

const THEMATIC_BREAK = /^---$/m
const TITLE = /^# [^\n]*/

/**
 * Splits PRIVACY.md into its translations. The file holds one policy per language, in the order
 * of `LANGUAGES`, separated by a `---` line. Each translation comes back without its `#` title,
 * which the page shows in its own words.
 *
 * @throws Error when the file doesn't hold exactly one part per language.
 */
export const splitPrivacyPolicy = (markdown: string): Readonly<Record<Language, string>> => {
  const parts = markdown.split(THEMATIC_BREAK).map((part) => part.trim().replace(TITLE, "").trim())
  if (parts.length !== LANGUAGES.length || parts.some((part) => part === "")) {
    throw new Error(
      `PRIVACY.md should hold ${LANGUAGES.length} policies (${LANGUAGES.join(", ")}) separated by lines of ---, but has ${parts.length} parts`,
    )
  }
  return Object.fromEntries(LANGUAGES.map((language, index) => [language, parts[index]])) as Record<
    Language,
    string
  >
}
