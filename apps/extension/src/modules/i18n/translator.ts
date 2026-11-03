import { catalogs, type EnglishMessage, type MessageKey } from "./catalog"
import { languageTagOf, type Locale } from "./locale"
import type { Message, MessageParams, PlaceholderNames } from "./message"

/**
 * A message without placeholders takes only the key; one with placeholders takes a value for every
 * name in the English message.
 */
export type MessageArgs<K extends MessageKey> = [PlaceholderNames<EnglishMessage<K>>] extends [
  never,
]
  ? []
  : [params: MessageParams<EnglishMessage<K>>]

type ParamValues = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{(\w+)\}/g

export interface Duration {
  readonly value: number
  readonly unit: "minute" | "hour" | "day" | "week"
}

const durationMessages = {
  minute: "common.duration.minute",
  hour: "common.duration.hour",
  day: "common.duration.day",
  week: "common.duration.week",
} as const satisfies Record<Duration["unit"], MessageKey>

export interface Translator {
  readonly locale: Locale
  /** The language tag for `<html lang>` and `lang` attributes. */
  readonly languageTag: string
  t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string
  /**
   * A negative `value` is in the past, a positive one in the future. Where the language has a
   * wording without a number, such as "yesterday" or "now", that wording is used.
   */
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string
  /** A length of time written as a number and a unit, such as "6 hours". */
  duration(duration: Duration): string
  /** The name of `locale`'s language, written in this translator's language. */
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
    duration: ({ value, unit }) => t(durationMessages[unit], { count: value }),
    languageName: (named) => languageNames.of(languageTagOf(named)) ?? languageTagOf(named),
  }
}
