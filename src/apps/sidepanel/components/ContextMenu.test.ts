import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { SpaceName } from "#modules/space"
import { TabId } from "#platform/browser"
import { renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "../testing/view-builders"

const workWithTab = spaceView("work", { temporaryTabs: [tabView(1)] })

const openTabMenu = () => fireEvent.contextMenu(screen.getByRole("button", { name: "タブ 1" }))

describe("タブのコンテキストメニュー", () => {
  it("右クリックで開き、Escape で閉じる", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()
    expect(screen.getByRole("menu", { name: "タブのメニュー" })).toBeTruthy()

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("メニューの外側を押すと閉じる", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    await fireEvent.pointerDown(document.body)

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("項目を選ぶとそのコマンドを送り、メニューを閉じる", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "ピン留め" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "PinTab", tabId: TabId.make(1) }])
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("「Space へ移動」から選んだ Space へタブを移す", async () => {
    const hobby = spaceView("hobby", { name: SpaceName.make("趣味") })
    const { connection } = await renderSidebar(sidebarView({ spaces: [workWithTab, hobby] }))
    await openTabMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Space へ移動" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "趣味" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "MoveTabToSpace", tabId: TabId.make(1), spaceId: "hobby" },
    ])
  })

  it("移動先の Space が無ければ「Space へ移動」を出さない", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    expect(screen.queryByRole("menuitem", { name: "Space へ移動" })).toBeNull()
  })

  it("一時タブのメニューにはブックマークの URL を置き換える項目を出さない", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    expect(
      screen.queryByRole("menuitem", { name: "ブックマークの URL を現在の URL に置き換え" }),
    ).toBeNull()
  })

  it("矢印キーで項目間を移動できる", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()
    const menu = screen.getByRole("menu")
    const [first, second] = screen.getAllByRole("menuitem")

    await fireEvent.keyDown(menu, { key: "ArrowDown" })

    expect(first).not.toBe(document.activeElement)
    expect(second).toBe(document.activeElement)
  })
})
