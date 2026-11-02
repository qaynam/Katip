import { Effect, Layer, Option } from "effect"
import { mount } from "svelte"
import { makeTranslator, resolveLocale } from "#modules/i18n"
import { SettingsRepository } from "#modules/settings"
import { Storage, WindowId } from "#platform/browser"
import { callerWindowOfSpotlight, SPOTLIGHT_PORT_NAME } from "#protocol"
import App from "./App.svelte"
import { createSpotlightPortConnection, type SpotlightPort } from "./connection/port-connection"

const openPort = (): SpotlightPort => {
  const port = chrome.runtime.connect({ name: SPOTLIGHT_PORT_NAME })
  // Left unread, it logs "Unchecked runtime.lastError" whenever a stopping service worker cuts the
  // port
  port.onDisconnect.addListener(() => void chrome.runtime.lastError)
  return port
}

const faviconUrl = (pageUrl: string) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", "32")
  return url.toString()
}

// For when the caller is unknown, such as when the URL was opened by hand
const lastFocusedNormalWindow = async () => {
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] })
  return window.id === undefined ? null : WindowId.make(window.id)
}

// Falls back to the browser's language, so that Spotlight still opens when the settings can't be
// read
const localePreference = Effect.runPromise(
  SettingsRepository.use((settings) => settings.get).pipe(
    Effect.map((settings) => settings.locale),
    Effect.orElseSucceed(() => "auto" as const),
    Effect.provide(SettingsRepository.layer.pipe(Layer.provide(Storage.layer))),
  ),
)

const callerWindowId = await Option.match(callerWindowOfSpotlight(location.href), {
  onSome: (windowId) => Promise.resolve(windowId),
  onNone: lastFocusedNormalWindow,
})
const translator = makeTranslator(resolveLocale(await localePreference, navigator.languages))
document.documentElement.lang = translator.languageTag

if (callerWindowId === null) {
  window.close()
} else {
  mount(App, {
    target: document.body,
    props: {
      connection: createSpotlightPortConnection({ openPort, callerWindowId }),
      faviconUrl,
      close: () => window.close(),
      translator,
    },
  })
}
