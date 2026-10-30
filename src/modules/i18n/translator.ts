import { catalogs, type EnglishMessage, type MessageKey } from "./catalog"
import { languageTagOf, type Locale } from "./locale"
import type { Message, MessageParams, PlaceholderNames } from "./message"

/** 差し込む値の無い文言はキーだけで呼び、ある文言は英語の文言にある名前の値をすべて渡す。 */
export type MessageArgs<K extends MessageKey> = [PlaceholderNames<EnglishMessage<K>>] extends [
  never,
]
  ? []
  : [params: MessageParams<EnglishMessage<K>>]

type ParamValues = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{(\w+)\}/g

export interface Translator {
  readonly locale: Locale
  /** `<html lang>` や `lang` 属性に入れる言語タグ。 */
  readonly languageTag: string
  t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string
  /**
   * `value` が負なら過去、正なら未来を表す。「昨日」「今」のように数を使わない言い方がある場合は、
   * そちらになる。
   */
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string
  /** `locale` の言語の名前を、この Translator の言語で書いたもの。 */
  languageName(locale: Locale): string
}

export const makeTranslator = (locale: Locale): Translator => {
  const languageTag = languageTagOf(locale)
  const messages: Readonly<Record<MessageKey, Message>> = catalogs[locale]
  const pluralRules = new Intl.PluralRules(languageTag)
  const numberFormat = new Intl.NumberFormat(languageTag)
  const relativeTimeFormat = new Intl.RelativeTimeFormat(languageTag, { numeric: "auto" })
  const languageNames = new Intl.DisplayNames([languageTag], { type: "language" })

  const textFor = (message: Message, params: ParamValues): string => {
    if (typeof message === "string") return message
    const count = params["count"]
    const selected = typeof count === "number" ? message[pluralRules.select(count)] : undefined
    return selected ?? message.other
  }

  const fillPlaceholders = (text: string, params: ParamValues) =>
    text.replace(PLACEHOLDER, (placeholder, name: string) => {
      const value = params[name]
      if (value === undefined) return placeholder
      return typeof value === "number" ? numberFormat.format(value) : value
    })

  const t = (key: MessageKey, params: ParamValues = {}) =>
    fillPlaceholders(textFor(messages[key], params), params)

  return {
    locale,
    languageTag,
    t,
    relativeTime: (value, unit) => relativeTimeFormat.format(value, unit),
    languageName: (named) => languageNames.of(languageTagOf(named)) ?? languageTagOf(named),
  }
}
