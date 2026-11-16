import { Option, Schema } from "effect"
import { mount } from "svelte"
import { LocalePreference } from "#modules/i18n"
import { REPOSITORY_URL, type Release } from "#modules/updates"
import { SIDEBAR_PORT_NAME, type SidebarCommand } from "#protocol"
import App from "../sidepanel/App.svelte"
import type { Downloads } from "../sidepanel/connection/downloads"
import { createMemoryLocalePreferences } from "../sidepanel/connection/locale-preferences"
import { createMemoryConnection } from "../sidepanel/connection/memory-connection"
import { createMemoryDownloads } from "../sidepanel/connection/memory-downloads"
import { createMemoryOriginAccess } from "../sidepanel/connection/memory-origin-access"
import { createMemoryScrollPositions } from "../sidepanel/connection/memory-scroll-positions"
import { createMemoryUpdateNotices } from "../sidepanel/connection/memory-update-notices"
import { createPortConnection } from "../sidepanel/connection/port-connection"
import type { SidebarConnection } from "../sidepanel/connection/sidebar-connection"
import type { SidePanel } from "../sidepanel/connection/side-panel"
import { respondInFixture } from "./fixture-backend"
import { fixtureDownloads } from "./fixture-downloads"
import { fixtureView } from "./fixture-view"

const DEFAULT_EXTENSION_ID = "hggfdjnidgfpigakapgkgolnjemijaed"

// Told about when the address has ?update, to look at the card that tells about a newer release
const harnessRelease: Release = {
  version: "9.9.9",
  pageUrl: `${REPOSITORY_URL}/releases`,
  publishedAt: null,
}

type Mode = "fixture" | "extension"

const params = new URLSearchParams(location.search)
const mode: Mode = params.get("mode") === "extension" ? "extension" : "fixture"
const extensionId = params.get("extensionId") ?? DEFAULT_EXTENSION_ID

const element = <E extends HTMLElement>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`${selector} is missing from index.html`)
  return found
}

const commandLog = element<HTMLOListElement>("#command-log")
const denyAccess = element<HTMLInputElement>("#deny-access")
const denyDownloads = element<HTMLInputElement>("#deny-downloads")
const localeSelect = element<HTMLSelectElement>("#locale")

// Not the extension's setting, which this page can't read: the language is chosen in the toolbar
// and kept in the URL so it survives a reload
const decodeLocalePreference = Schema.decodeUnknownOption(LocalePreference)
const initialLocale = Option.getOrElse(
  decodeLocalePreference(params.get("locale")),
  (): LocalePreference => "auto",
)
const localePreferences = createMemoryLocalePreferences(initialLocale)
localeSelect.value = initialLocale
localeSelect.addEventListener("change", () =>
  Option.map(decodeLocalePreference(localeSelect.value), (chosen) => {
    localePreferences.set(chosen)
    const url = new URL(location.href)
    url.searchParams.set("locale", chosen)
    history.replaceState(null, "", url)
  }),
)

const log = (text: string) => {
  const entry = document.createElement("li")
  entry.textContent = text
  commandLog.prepend(entry)
  while (commandLog.children.length > 50) commandLog.lastElementChild?.remove()
}

const logCommand = (command: SidebarCommand) => log(JSON.stringify(command))

// Not chrome.permissions, which this page can't use since it isn't an extension page: the toolbar
// checkbox decides, and the requested origins are logged
const originAccess = createMemoryOriginAccess({
  decide: (origins) => {
    const isGranted = !denyAccess.checked
    log(`permissions.request ${JSON.stringify(origins)} → ${isGranted ? "granted" : "denied"}`)
    return isGranted
  },
})

// Not chrome.sidePanel, which this page isn't shown in: closing is only logged
const sidePanel: SidePanel = {
  close: (windowId) => log(`sidePanel.close ${JSON.stringify({ windowId })}`),
}

// Not chrome.downloads, which this page can't use: sample downloads stand in, the one running
// moves on every second, and ?downloads starts with access already granted
const fakeDownloads = createMemoryDownloads({
  downloads: fixtureDownloads(Date.now()),
  access: params.has("downloads") ? "Granted" : "NotAsked",
  decide: () => {
    const isGranted = !denyDownloads.checked
    log(`permissions.request downloads → ${isGranted ? "granted" : "denied"}`)
    return isGranted
  },
  fileManager: navigator.platform.startsWith("Mac") ? "Finder" : "Folder",
})
setInterval(() => {
  for (const download of fakeDownloads.downloads) {
    const { progress } = download
    if (progress._tag !== "InProgress" || progress.totalBytes === null) continue
    const receivedBytes = Math.min(progress.receivedBytes + 400_000, progress.totalBytes)
    fakeDownloads.put({
      ...download,
      progress:
        receivedBytes === progress.totalBytes
          ? { _tag: "Complete", bytes: receivedBytes }
          : { ...progress, receivedBytes },
    })
  }
}, 1_000)
const downloads: Downloads = {
  ...fakeDownloads,
  open: (id) => {
    log(`downloads.open ${id}`)
    fakeDownloads.open(id)
  },
  show: (id) => {
    log(`downloads.show ${id}`)
    fakeDownloads.show(id)
  },
}

const withCommandLog = (connection: SidebarConnection): SidebarConnection => ({
  listen: connection.listen,
  run: (command) => {
    logCommand(command)
    return connection.run(command)
  },
})

const fixtureConnection = () =>
  createMemoryConnection({
    view: fixtureView(Date.now()),
    respond: (command, view) =>
      view === null
        ? { outcome: { _tag: "Failed", reason: "There's no view" } }
        : respondInFixture(command, view, Date.now()),
  })

// On a page outside the extension, chrome.runtime.connect only exists while an extension whose
// externally_connectable matches the page is installed
const extensionConnection = () =>
  typeof chrome === "undefined" || chrome.runtime?.connect === undefined
    ? null
    : createPortConnection({
        windowId: null,
        openPort: () => {
          const port = chrome.runtime.connect(extensionId, { name: SIDEBAR_PORT_NAME })
          port.onDisconnect.addListener(() => void chrome.runtime.lastError)
          return port
        },
      })

const showModeLinks = () => {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-mode]")) {
    const linkMode = link.dataset["mode"]
    const target = new URLSearchParams({ mode: linkMode ?? "fixture" })
    if (linkMode === "extension") target.set("extensionId", extensionId)
    link.href = `?${target.toString()}`
    if (linkMode === mode) link.setAttribute("aria-current", "page")
  }
  element("#extension-id").textContent = extensionId
}

const frame = element("#frame")
showModeLinks()

const connection = mode === "fixture" ? fixtureConnection() : extensionConnection()

if (connection === null) {
  frame.dataset["state"] = "unavailable"
  frame.textContent =
    "Can't connect to the extension. Open this page in Chrome with Katip (dev) loaded, and check the extension ID."
} else {
  mount(App, {
    target: frame,
    props: {
      connection: withCommandLog(connection),
      originAccess,
      downloads,
      localePreferences,
      browserLanguages: navigator.languages,
      scrollPositions: createMemoryScrollPositions(),
      sidePanel,
      updateNotices: createMemoryUpdateNotices(params.has("update") ? harnessRelease : null),
    },
  })
}
