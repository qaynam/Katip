import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "../src/languages.ts"

interface LanguageRange {
  /** The language tag in lower case, such as `ja-jp`, or `*`. */
  readonly tag: string
  readonly quality: number
}

const parseRange = (entry: string): LanguageRange | null => {
  const [tag = "", ...parameters] = entry.split(";").map((part) => part.trim())
  const qualityParameter = parameters.find((parameter) => /^q=/i.test(parameter))
  const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice("q=".length))
  return tag === "" || Number.isNaN(quality) ? null : { tag: tag.toLowerCase(), quality }
}

const languageOf = ({ tag }: LanguageRange) =>
  LANGUAGES.find((language) => tag === language || tag.startsWith(`${language}-`))

/** Countries, as ISO 3166 codes, whose visitors read the site in a language other than the default. */
const COUNTRY_LANGUAGES: ReadonlyMap<string, Language> = new Map([["JP", "ja"]])

const headerLanguage = (acceptLanguage: string | null) =>
  (acceptLanguage ?? "")
    .split(",")
    .map(parseRange)
    .filter((range): range is LanguageRange => range !== null && range.quality > 0)
    .toSorted((a, b) => b.quality - a.quality)
    .map(languageOf)
    .find((language) => language !== undefined)

/**
 * The site's language that an `Accept-Language` header ranks highest. When the header names none
 * of them, the language of the visitor's `country`, and otherwise the default language. Ranges of
 * equal quality keep the order the header lists them in, and a range with a quality of 0 doesn't
 * count.
 */
export const preferredLanguage = (
  acceptLanguage: string | null,
  country: string | null = null,
): Language =>
  headerLanguage(acceptLanguage) ??
  (country === null ? undefined : COUNTRY_LANGUAGES.get(country)) ??
  DEFAULT_LANGUAGE
