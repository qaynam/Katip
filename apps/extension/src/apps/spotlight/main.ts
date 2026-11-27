import { Option } from "effect"
import { mount } from "svelte"
import { resolveLocale, spotlightCatalogs, translatorOf } from "#modules/i18n"
import { SPOTLIGHT_LAYOUTS, SPOTLIGHT_SEARCH_HEIGHT } from "#modules/spotlight"
import { SPOTLIGHT_PORT_NAME, spotlightOpeningOf, targetOf } from "#protocol"
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

// Nothing is awaited on the way from the URL Katip opens to the mount, so the page's first frame,
// which the built page holds back until this script has run (see vite.config.ts), is Spotlight
// itself. Not imported with the rest: only a URL opened by hand needs it, and the settings and the
// storage it reads them from would otherwise load with every Spotlight
const opening =
  Option.getOrNull(spotlightOpeningOf(location.href)) ??
  (await (await import("./opening-from-storage")).openingFromStorage())
// Only needed once the window resizes, so its answer isn't waited for before the first frame
const spotlightWindowId = chrome.windows.getCurrent().then((window) => window.id)

if (opening === null) {
  window.close()
} else {
  const { callerWindowId, spaceTheme, size, locale, address } = opening
  const shown = resolveLocale(locale, navigator.languages)
  const translator = translatorOf(shown, spotlightCatalogs[shown])
  document.documentElement.lang = translator.languageTag
  document.title = translator.t("spotlight.documentTitle")
  mount(App, {
    target: document.body,
    props: {
      connection: createSpotlightPortConnection({
        openPort,
        callerWindowId,
        target: targetOf(opening),
      }),
      faviconUrl,
      close: () => window.close(),
      openSidePanel: () => void chrome.sidePanel.open({ windowId: callerWindowId }).catch(() => {}),
      translator,
      size,
      initialSpaceTheme: spaceTheme,
      initialQuery: address ?? "",
      setCollapsed: (collapsed: boolean) => {
        // What the window has beyond the page is its title bar, whose height differs by system
        const titleBar = window.outerHeight - window.innerHeight
        void spotlightWindowId.then((windowId) => {
          if (windowId === undefined) return
          void chrome.windows.update(windowId, {
            height: collapsed
              ? SPOTLIGHT_SEARCH_HEIGHT + titleBar
              : SPOTLIGHT_LAYOUTS[size].window.height,
          })
        })
      },
    },
  })
  // The second animation frame comes once the first frame has been drawn. On macOS the window
  // waits behind the calling one until then, so that it never shows black (see
  // spotlight-window.ts); elsewhere it's in front and focused already, and this changes nothing
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void spotlightWindowId.then((windowId) => {
        if (windowId === undefined) return
        // Rejected when the window has closed meanwhile, which leaves nothing to bring forward
        chrome.windows.update(windowId, { focused: true }).catch(() => {})
      })
    }),
  )
}
