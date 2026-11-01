import { Context, Effect } from "effect"
import { makeTranslator, type MessageArgs, type MessageKey, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import type { NumberedSpaceName } from "#modules/space"

/** ブラウザの言語。`navigator.languages` と同じく、優先する順に並んだ BCP 47 の言語タグ。 */
export const BrowserLanguages = Context.Reference<ReadonlyArray<string>>(
  "katip/background/BrowserLanguages",
  { defaultValue: () => globalThis.navigator?.languages ?? [] },
)

/**
 * 設定した言語（自動ならブラウザの言語）の Translator。言語を変えると、次に求めたときから変わる。
 *
 * @remarks
 * 失敗しない。設定を読めなければ、ブラウザの言語に合わせる。
 */
export const currentTranslator = Effect.gen(function* () {
  const settings = yield* SettingsRepository.use((repository) => repository.get).pipe(
    Effect.orElseSucceed(() => defaultSettings),
  )
  return makeTranslator(resolveLocale(settings.locale, yield* BrowserLanguages))
})

/** 埋め込む値の無い文言のキー。 */
export type PlainMessageKey = {
  readonly [K in MessageKey]: MessageArgs<K> extends readonly [] ? K : never
}[MessageKey]

/** 設定した言語での文言。 */
export const translate = (key: PlainMessageKey) =>
  Effect.map(currentTranslator, (translator) => translator.t(key))

/** 名前を付けずに作る Space の、設定した言語での名前の付け方。 */
export const numberedSpaceName = Effect.map(
  currentTranslator,
  (translator): NumberedSpaceName =>
    (number) =>
      translator.t("common.spaceNumbered", { n: number }),
)
