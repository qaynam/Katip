import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import type { LocalePreference } from "#modules/i18n"
import { SettingsRepository } from "#modules/settings"
import { Storage } from "#platform/browser"

/** The display language chosen in the settings. Tests and the dev harness swap in a fake. */
export interface LocalePreferences {
  /**
   * Delivers the current setting first, then again on every change. Call the returned
   * function to unsubscribe. Delivers nothing when the settings can't be read.
   */
  readonly listen: (listener: (preference: LocalePreference) => void) => () => void
}

/**
 * Reads from the extension's settings (sync storage). Changing the language on the options
 * page switches an open side panel right away.
 */
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

/** A fake that delivers a fixed preference. `set` simulates changing the setting. */
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
