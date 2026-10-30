import { Array, Option, pipe, Schema } from "effect"

export const Locale = Schema.Literals(["en", "ja", "zh", "es"])
export type Locale = typeof Locale.Type

/** `auto` はブラウザの言語に合わせる。 */
export const LocalePreference = Schema.Literals(["auto", ...Locale.literals])
export type LocalePreference = typeof LocalePreference.Type

const FALLBACK_LOCALE: Locale = "en"

const languageTags: { readonly [L in Locale]: string } = {
  en: "en",
  ja: "ja",
  // zh だけでは文字体系を示さない。簡体字と明示し、読み上げや漢字のフォント選びを簡体字に合わせる
  zh: "zh-Hans",
  es: "es",
}

/** `<html lang>` や `Intl` に渡す BCP 47 の言語タグ。 */
export const languageTagOf = (locale: Locale): string => languageTags[locale]

/** 言語の選択肢に出す名前。読めない言語に切り替えてしまっても戻れるよう、その言語自身で書く。 */
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
    // 用意しているのは簡体字だけ。繁体字を読む人には、簡体字より次に好む言語を出す
    Option.filter((locale) => locale.language !== "zh" || locale.script === "Hans"),
    Option.map((locale) => locale.language),
    Option.filter(isLocale),
  )

/**
 * @param browserLanguages - `navigator.languages` と同じく、優先する順に並んだ BCP 47 の言語タグ。
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
