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

/**
 * The site's language that an `Accept-Language` header ranks highest, or the default language
 * when the header names none of them. Ranges of equal quality keep the order the header lists
 * them in, and a range with a quality of 0 doesn't count.
 */
export const preferredLanguage = (acceptLanguage: string | null): Language =>
  (acceptLanguage ?? "")
    .split(",")
    .map(parseRange)
    .filter((range): range is LanguageRange => range !== null && range.quality > 0)
    .toSorted((a, b) => b.quality - a.quality)
    .map(languageOf)
    .find((language) => language !== undefined) ?? DEFAULT_LANGUAGE
