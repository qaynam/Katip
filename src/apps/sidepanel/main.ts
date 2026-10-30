import { mount } from "svelte"
import { WindowId } from "#platform/browser"
import { SIDEBAR_PORT_NAME } from "#protocol"
import App from "./App.svelte"
import { chromeOriginAccess } from "./connection/origin-access"
import { createPortConnection, type SidebarPort } from "./connection/port-connection"

const openPort = (): SidebarPort => {
  const port = chrome.runtime.connect({ name: SIDEBAR_PORT_NAME })
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

const currentWindow = await chrome.windows.getCurrent()

mount(App, {
  target: document.body,
  props: {
    connection: createPortConnection({
      openPort,
      windowId: currentWindow.id === undefined ? null : WindowId.make(currentWindow.id),
    }),
    originAccess: chromeOriginAccess,
    faviconUrl,
  },
})
