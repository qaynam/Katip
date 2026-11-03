import { Array, Option, pipe, Schema } from "effect"

export const Locale = Schema.Literals(["en", "ja", "zh", "es"])
export type Locale = typeof Locale.Type

/** `auto` follows the browser's language. */
export const LocalePreference = Schema.Literals(["auto", ...Locale.literals])
export type LocalePreference = typeof LocalePreference.Type

const FALLBACK_LOCALE: Locale = "en"

const languageTags: { readonly [L in Locale]: string } = {
  en: "en",
  ja: "ja",
  // Not plain zh: it doesn't say which script. Naming Simplified makes speech and the choice of Han
  // fonts match Simplified Chinese
  zh: "zh-Hans",
  es: "es",
}

/** The BCP 47 language tag for `<html lang>` and `Intl`. */
export const languageTagOf = (locale: Locale): string => languageTags[locale]

/**
 * The names shown in the language options, each written in that language itself so that someone who
 * switched to a language they can't read can still find their way back.
 */
export const nativeLanguageNames: { readonly [L in Locale]: string } = {
  en: "English",
  ja: "日本語",
  zh: "简体中文",
  es: "Español",
}

const isLocale = Schema.is(Locale)

const parseLanguageTag = Option.liftThrowable((tag: string) => new Intl.Locale(tag).maximize())

const supportedLocaleOf = (tag: string): Option.Option<Locale> =>
  pipe(
    parseLanguageTag(tag),
    // Only Simplified Chinese is provided. Readers of Traditional Chinese get their next preferred
    // language rather than Simplified
    Option.filter((locale) => locale.language !== "zh" || locale.script === "Hans"),
    Option.map((locale) => locale.language),
    Option.filter(isLocale),
  )

/**
 * @param browserLanguages - BCP 47 language tags, most preferred first, as in
 *   `navigator.languages`.
 */
export const resolveLocale = (
  preference: LocalePreference,
  browserLanguages: ReadonlyArray<string>,
): Locale =>
  preference === "auto"
    ? pipe(
        Array.findFirst(browserLanguages, supportedLocaleOf),
        Option.getOrElse(() => FALLBACK_LOCALE),
      )
    : preference
