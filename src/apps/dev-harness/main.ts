import { Option, Schema } from "effect"
import { mount } from "svelte"
import { LocalePreference } from "#modules/i18n"
import { SIDEBAR_PORT_NAME, type SidebarCommand } from "#protocol"
import App from "../sidepanel/App.svelte"
import { createMemoryLocalePreferences } from "../sidepanel/connection/locale-preferences"
import { createMemoryConnection } from "../sidepanel/connection/memory-connection"
import { createMemoryOriginAccess } from "../sidepanel/connection/memory-origin-access"
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
  if (found === null) throw new Error(`${selector} が index.html にありません`)
  return found
}

const commandLog = element<HTMLOListElement>("#command-log")
const denyAccess = element<HTMLInputElement>("#deny-access")
const localeSelect = element<HTMLSelectElement>("#locale")

// このページから拡張の設定は読めないので、表示言語はツールバーで選び、URL に残して再読み込みでも保つ
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

// このページは拡張のページではないので chrome.permissions を使えない。許可するかどうかは
// ツールバーのチェックで決め、求められたオリジンを記録に残す
const originAccess = createMemoryOriginAccess({
  decide: (origins) => {
    const isGranted = !denyAccess.checked
    log(`permissions.request ${JSON.stringify(origins)} → ${isGranted ? "許可" : "拒否"}`)
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
        ? { outcome: { _tag: "Failed", reason: "ビューがありません" } }
        : respondInFixture(command, view, Date.now()),
  })

// 拡張の外のページでは、externally_connectable に一致する拡張が入っているときだけ
// chrome.runtime.connect が生える
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
    "拡張に接続できません。Katip (dev) を読み込んだ Chrome でこのページを開き、拡張 ID を確認してください。"
} else {
  mount(App, {
    target: frame,
    props: {
      connection: withCommandLog(connection),
      originAccess,
      localePreferences,
      browserLanguages: navigator.languages,
    },
  })
}
