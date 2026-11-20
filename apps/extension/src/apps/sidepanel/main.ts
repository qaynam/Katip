import { mount } from "svelte"
import { WindowId } from "#platform/browser"
import { SIDEBAR_PORT_NAME } from "#protocol"
import App from "./App.svelte"
import { makeChromeDownloads } from "./connection/downloads"
import { makeStoredLocalePreferences } from "./connection/locale-preferences"
import { chromeOriginAccess } from "./connection/origin-access"
import { chromePageOutputs } from "./connection/page-outputs"
import { createPortConnection, type SidebarPort } from "./connection/port-connection"
import { makeSessionScrollPositions } from "./connection/scroll-positions"
import { chromeSidePanel } from "./connection/side-panel"
import { makeGitHubUpdateNotices, noUpdateNotices } from "./connection/update-notices"

const openPort = (): SidebarPort => {
  const port = chrome.runtime.connect({ name: SIDEBAR_PORT_NAME })
  // Without reading lastError, every disconnect caused by the service worker stopping logs
  // "Unchecked runtime.lastError"
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
    pageOutputs: chromePageOutputs,
    downloads: makeChromeDownloads({
      fileManager: navigator.platform.startsWith("Mac") ? "Finder" : "Folder",
    }),
    localePreferences: makeStoredLocalePreferences(),
    browserLanguages: navigator.languages,
    faviconUrl,
    scrollPositions: makeSessionScrollPositions(),
    sidePanel: chromeSidePanel,
    updateNotices: import.meta.env.KATIP_UPDATED_FROM_GITHUB
      ? makeGitHubUpdateNotices(chrome.runtime.getManifest().version)
      : noUpdateNotices,
  },
})
