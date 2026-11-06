import { render, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import type { SidebarCommand } from "#protocol"
import App from "./App.svelte"
import { createMemoryLocalePreferences } from "./connection/locale-preferences"
import { createMemoryOriginAccess } from "./connection/memory-origin-access"
import { createMemoryScrollPositions } from "./connection/memory-scroll-positions"
import type { SidebarConnection } from "./connection/sidebar-connection"
import { renderSidebar } from "./testing/render-sidebar"
import {
  liveItem,
  pinnedLiveFolder,
  sidebarView,
  spaceView,
  tabView,
} from "./testing/view-builders"

const view = sidebarView({ spaces: [spaceView("work", { temporaryTabs: [tabView(1)] })] })

describe("Display language", () => {
  it("shows the side panel in Japanese when Japanese is chosen in the settings", async () => {
    await renderSidebar(view, { locale: "ja" })

    expect(screen.getByRole("button", { name: "検索" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "新しいタブ" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "ピン留め" })).toBeTruthy()
  })

  it("follows the browser language when the language setting is auto", async () => {
    await renderSidebar(view, { locale: "auto", browserLanguages: ["es-ES", "en"] })

    expect(screen.getByRole("button", { name: "Buscar" })).toBeTruthy()
  })

  it("switches to the new language when the setting changes while open", async () => {
    const { changeLocale } = await renderSidebar(view)

    await changeLocale("zh")

    expect(screen.getByRole("button", { name: "新标签页" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New Tab" })).toBeNull()
  })

  it("sets the page's lang attribute to the display language", async () => {
    const { changeLocale } = await renderSidebar(view)

    await changeLocale("zh")

    expect(document.documentElement.lang).toBe("zh-Hans")
  })
})

describe("Counts", () => {
  const viewWithUnseen = (count: number) =>
    sidebarView({
      spaces: [
        spaceView("work", {
          pinnedNodes: [
            pinnedLiveFolder("inbox", {
              title: "Inbox",
              isExpanded: false,
              items: Array.from({ length: count }, (_, index) =>
                liveItem(`mail-${index}`, { isUnseen: true }),
              ),
            }),
          ],
        }),
      ],
    })

  const inboxHeader = () => screen.getByRole("button", { name: /^Inbox/ })

  it("uses the singular for 1 and the plural for 2 or more in English", async () => {
    const { pushView } = await renderSidebar(viewWithUnseen(1), { locale: "en" })
    const single = inboxHeader().textContent

    await pushView(viewWithUnseen(2))

    expect([single, inboxHeader().textContent]).toStrictEqual([
      expect.stringContaining("1 unread item"),
      expect.stringContaining("2 unread items"),
    ])
  })

  it("changes only the number in Japanese, which has no plural forms", async () => {
    await renderSidebar(viewWithUnseen(1), { locale: "ja" })

    expect(inboxHeader().textContent).toContain("未読 1 件")
  })
})

describe("Commands that never reach the background", () => {
  it("reports why in the display language", async () => {
    const connection: SidebarConnection = {
      listen: (listener) => {
        listener({ _tag: "ViewUpdated", view })
        return () => {}
      },
      run: async (_command: SidebarCommand) => ({ _tag: "Undelivered", reason: "NotConnected" }),
    }
    render(App, {
      props: {
        connection,
        originAccess: createMemoryOriginAccess(),
        localePreferences: createMemoryLocalePreferences("en"),
        browserLanguages: [],
        scrollPositions: createMemoryScrollPositions(),
      },
    })
    await tick()

    screen.getByRole("button", { name: "New Tab" }).click()
    await tick()
    await tick()

    expect(within(screen.getByRole("status")).getByText(/Not connected to Katip yet/)).toBeTruthy()
  })
})
