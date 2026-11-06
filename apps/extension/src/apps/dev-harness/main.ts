import { Option, Schema } from "effect"
import { mount } from "svelte"
import { LocalePreference } from "#modules/i18n"
import { SIDEBAR_PORT_NAME, type SidebarCommand } from "#protocol"
import App from "../sidepanel/App.svelte"
import { createMemoryLocalePreferences } from "../sidepanel/connection/locale-preferences"
import { createMemoryConnection } from "../sidepanel/connection/memory-connection"
import { createMemoryOriginAccess } from "../sidepanel/connection/memory-origin-access"
import { createMemoryScrollPositions } from "../sidepanel/connection/memory-scroll-positions"
import { createPortConnection } from "../sidepanel/connection/port-connection"
import type { SidebarConnection } from "../sidepanel/connection/sidebar-connection"
import { respondInFixture } from "./fixture-backend"
import { fixtureView } from "./fixture-view"

const DEFAULT_EXTENSION_ID = "hggfdjnidgfpigakapgkgolnjemijaed"

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
      localePreferences,
      browserLanguages: navigator.languages,
      scrollPositions: createMemoryScrollPositions(),
    },
  })
}
