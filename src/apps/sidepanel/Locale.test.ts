import { render, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import type { SidebarCommand } from "#protocol"
import App from "./App.svelte"
import { createMemoryLocalePreferences } from "./connection/locale-preferences"
import { createMemoryOriginAccess } from "./connection/memory-origin-access"
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

describe("表示する言語", () => {
  it("設定で英語を選ぶと、サイドパネルの文言が英語になる", async () => {
    await renderSidebar(view, { locale: "en" })

    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "New Tab" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Pinned" })).toBeTruthy()
  })

  it("言語の設定が自動なら、ブラウザの言語に合わせる", async () => {
    await renderSidebar(view, { locale: "auto", browserLanguages: ["es-ES", "en"] })

    expect(screen.getByRole("button", { name: "Buscar" })).toBeTruthy()
  })

  it("開いたまま設定の言語を変えると、表示がその言語に切り替わる", async () => {
    const { changeLocale } = await renderSidebar(view, { locale: "ja" })

    await changeLocale("zh")

    expect(screen.getByRole("button", { name: "新标签页" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "新しいタブ" })).toBeNull()
  })

  it("ページの言語の指定を、表示する言語に合わせる", async () => {
    const { changeLocale } = await renderSidebar(view, { locale: "ja" })

    await changeLocale("zh")

    expect(document.documentElement.lang).toBe("zh-Hans")
  })
})

describe("件数の表示", () => {
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

  it("英語では 1 件なら単数形、2 件以上なら複数形で書く", async () => {
    const { pushView } = await renderSidebar(viewWithUnseen(1), { locale: "en" })
    const single = inboxHeader().textContent

    await pushView(viewWithUnseen(2))

    expect([single, inboxHeader().textContent]).toStrictEqual([
      expect.stringContaining("1 unread item"),
      expect.stringContaining("2 unread items"),
    ])
  })

  it("語形の変わらない日本語では、件数だけが変わる", async () => {
    await renderSidebar(viewWithUnseen(1), { locale: "ja" })

    expect(inboxHeader().textContent).toContain("未読 1 件")
  })
})

describe("background に届かなかったコマンド", () => {
  it("届かなかった理由を、表示する言語で知らせる", async () => {
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
      },
    })
    await tick()

    screen.getByRole("button", { name: "New Tab" }).click()
    await tick()
    await tick()

    expect(within(screen.getByRole("status")).getByText(/Not connected to Katip yet/)).toBeTruthy()
  })
})
