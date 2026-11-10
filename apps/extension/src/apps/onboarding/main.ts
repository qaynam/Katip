import { Effect } from "effect"
import { mount } from "svelte"
import { makeTranslator, resolveLocale } from "#modules/i18n"
import { defaultSettings, SettingsRepository } from "#modules/settings"
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
  },
})
