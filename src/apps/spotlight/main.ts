import { Option } from "effect"
import { mount } from "svelte"
import { WindowId } from "#platform/browser"
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

const callerWindowId = await Option.match(callerWindowOfSpotlight(location.href), {
  onSome: (windowId) => Promise.resolve(windowId),
  onNone: lastFocusedNormalWindow,
})

if (callerWindowId === null) {
  window.close()
} else {
  mount(App, {
    target: document.body,
    props: {
      connection: createSpotlightPortConnection({ openPort, callerWindowId }),
      faviconUrl,
      close: () => window.close(),
    },
  })
}
