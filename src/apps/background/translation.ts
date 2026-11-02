import { Context, Effect } from "effect"
import { makeTranslator, type MessageArgs, type MessageKey, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import type { NumberedSpaceName } from "#modules/space"

/** The browser's languages, as BCP 47 tags in order of preference like `navigator.languages`. */
export const BrowserLanguages = Context.Reference<ReadonlyArray<string>>(
  "katip/background/BrowserLanguages",
  { defaultValue: () => globalThis.navigator?.languages ?? [] },
)

/**
 * The Translator for the chosen language (the browser's language when automatic). A change of
 * language applies from the next time it's asked for.
 *
 * @remarks
 * Never fails. When the settings can't be read, follows the browser's language.
 */
export const currentTranslator = Effect.gen(function* () {
  const settings = yield* SettingsRepository.use((repository) => repository.get).pipe(
    Effect.orElseSucceed(() => defaultSettings),
  )
  return makeTranslator(resolveLocale(settings.locale, yield* BrowserLanguages))
})

/** Keys of the messages with no values to fill in. */
export type PlainMessageKey = {
  readonly [K in MessageKey]: MessageArgs<K> extends readonly [] ? K : never
}[MessageKey]

/** The message in the chosen language. */
export const translate = (key: PlainMessageKey) =>
  Effect.map(currentTranslator, (translator) => translator.t(key))

/** How a Space created without a name is named, in the chosen language. */
export const numberedSpaceName = Effect.map(
  currentTranslator,
  (translator): NumberedSpaceName =>
    (number) =>
      translator.t("common.spaceNumbered", { n: number }),
)
