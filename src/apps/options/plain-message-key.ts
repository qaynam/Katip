import type { MessageArgs, MessageKey } from "#modules/i18n"

/** Key of a message with no placeholders, which `t` translates from the key alone. */
export type PlainMessageKey = {
  readonly [K in MessageKey]: MessageArgs<K> extends readonly [] ? K : never
}[MessageKey]
