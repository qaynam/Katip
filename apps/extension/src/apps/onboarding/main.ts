import { Effect } from "effect"
import { mount } from "svelte"
import { makeTranslator, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
import { WindowId } from "#platform/browser"
import { SIDEBAR_PORT_NAME } from "#protocol"
import { chromeOriginAccess } from "../sidepanel/connection/origin-access"
import { createPortConnection } from "../sidepanel/connection/port-connection"
import App from "./App.svelte"
import { makeOnboardingRuntime } from "./onboarding-runtime"

const runtime = makeOnboardingRuntime()

// Falls back to the browser's language, so the page still opens when the settings can't be read
const { locale } = await runtime.runPromise(
  SettingsRepository.use((settings) => settings.get).pipe(
    Effect.orElseSucceed(() => defaultSettings),
  ),
)
const translator = makeTranslator(resolveLocale(locale, navigator.languages))
document.documentElement.lang = translator.languageTag
document.title = translator.t("onboarding.documentTitle")

// Read now rather than when a button is pressed: Chrome opens the side panel only while handling
// the press itself, and waiting for the window first would let that moment pass
const currentWindow = await chrome.windows.getCurrent()
const currentTab = await chrome.tabs.getCurrent()

const faviconUrl = (pageUrl: string) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", "32")
  return url.toString()
}

const openPort = () => {
  const port = chrome.runtime.connect({ name: SIDEBAR_PORT_NAME })
  // Left unread, it logs "Unchecked runtime.lastError" whenever a stopping service worker cuts it
  port.onDisconnect.addListener(() => void chrome.runtime.lastError)
  return port
}

mount(App, {
  target: document.body,
  props: {
    runtime,
    translator,
    optionsPageUrl: chrome.runtime.getURL("options/index.html"),
    openSidePanel: async () => {
      if (currentWindow.id === undefined) return
      await chrome.sidePanel.open({ windowId: currentWindow.id }).catch(() => {})
    },
    close: () => {
      if (currentTab?.id !== undefined) void chrome.tabs.remove(currentTab.id)
    },
    // The way the side panel talks to the background, for the window this page is in, so the
    // steps that change a Space change the one shown there
    connection: createPortConnection({
      openPort,
      windowId: currentWindow.id === undefined ? null : WindowId.make(currentWindow.id),
    }),
    originAccess: chromeOriginAccess,
    faviconUrl,
  },
})
