import { Effect, Layer, Option } from "effect"
import { mount } from "svelte"
import { makeTranslator, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import { SPOTLIGHT_LAYOUTS, SPOTLIGHT_SEARCH_HEIGHT } from "#modules/spotlight"
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

// Falls back to the defaults, the browser's language among them, so that Spotlight still opens
// when the settings can't be read
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
const spotlightWindow = await chrome.windows.getCurrent()
const translator = makeTranslator(resolveLocale(locale, navigator.languages))
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
      size: spotlightSize,
      setCollapsed: (collapsed: boolean) => {
        if (spotlightWindow.id === undefined) return
        // What the window has beyond the page is its title bar, whose height differs by system
        const titleBar = window.outerHeight - window.innerHeight
        void chrome.windows.update(spotlightWindow.id, {
          height: collapsed
            ? SPOTLIGHT_SEARCH_HEIGHT + titleBar
            : SPOTLIGHT_LAYOUTS[spotlightSize].window.height,
        })
      },
    },
  })
}
