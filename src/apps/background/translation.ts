import { Context, Effect } from "effect"
import { makeTranslator, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"

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
