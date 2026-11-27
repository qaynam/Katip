import { Effect, Layer, Option } from "effect"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import { Storage, WindowId } from "#platform/browser"
import { callerWindowOfSpotlight, type SpotlightOpening } from "#protocol"

// For when the caller is unknown, such as when the URL was opened by hand
const lastFocusedNormalWindow = async () => {
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] })
  return window.id === undefined ? null : WindowId.make(window.id)
}

/**
 * How to open Spotlight from a URL without what Katip puts in it, such as one opened by hand. Falls
 * back to the default settings, the browser's language among them, so that Spotlight still opens
 * when they can't be read. Null when there is no window to open it over.
 */
export const openingFromStorage = async (): Promise<SpotlightOpening | null> => {
  const settings = Effect.runPromise(
    SettingsRepository.use((repository) => repository.get).pipe(
      Effect.orElseSucceed(() => defaultSettings),
      Effect.provide(SettingsRepository.layer.pipe(Layer.provide(Storage.layer))),
    ),
  )
  const callerWindowId = await Option.match(callerWindowOfSpotlight(location.href), {
    onSome: (windowId) => Promise.resolve(windowId),
    onNone: lastFocusedNormalWindow,
  })
  const { locale, spotlightSize } = await settings
  return callerWindowId === null
    ? null
    : { callerWindowId, spaceTheme: null, size: spotlightSize, locale, address: null }
}
