import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import type { LocalePreference } from "#modules/i18n"
import { SettingsRepository } from "#modules/settings"
import { Storage } from "#platform/browser"

/** 設定で選んだ表示言語。テストや検証ページでは偽物に差し替える。 */
export interface LocalePreferences {
  /**
   * 今の設定をまず届け、以降は設定が変わるたびに届ける。返り値の関数を呼ぶと購読をやめる。
   * 設定を読めないときは何も届けない。
   */
  readonly listen: (listener: (preference: LocalePreference) => void) => () => void
}

/** 拡張機能の設定（sync storage）から読む。設定画面で言語を変えると、開いたまま切り替わる。 */
export const makeStoredLocalePreferences = (): LocalePreferences => {
  const runtime = ManagedRuntime.make(SettingsRepository.layer.pipe(Layer.provide(Storage.layer)))
  return {
    listen: (listener) =>
      runtime.runCallback(
        SettingsRepository.use((repository) =>
          Stream.runForEach(repository.changes, (settings) =>
            Effect.sync(() => listener(settings.locale)),
          ),
        ).pipe(Effect.ignore),
      ),
  }
}

/** 決めた言語を返す偽物。`set` で設定を変えたことにする。 */
export interface MemoryLocalePreferences extends LocalePreferences {
  readonly set: (preference: LocalePreference) => void
}

export const createMemoryLocalePreferences = (
  initial: LocalePreference,
): MemoryLocalePreferences => {
  let current = initial
  const listeners = new Set<(preference: LocalePreference) => void>()
  return {
    listen: (listener) => {
      listeners.add(listener)
      listener(current)
      return () => listeners.delete(listener)
    },
    set: (preference) => {
      current = preference
      for (const listener of listeners) listener(preference)
    },
  }
}
