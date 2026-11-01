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
  // 読まないと、service worker の停止で切れるたびに Unchecked runtime.lastError が出る
  port.onDisconnect.addListener(() => void chrome.runtime.lastError)
  return port
}

const faviconUrl = (pageUrl: string) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", "32")
  return url.toString()
}

// URL を手で開いたなどで呼び出し元が分からないときは、最後に使っていた通常のウィンドウを使う
const lastFocusedNormalWindow = async () => {
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] })
  return window.id === undefined ? null : WindowId.make(window.id)
}

// 設定を読めなくても開けるよう、そのときはブラウザの言語で表示する
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
