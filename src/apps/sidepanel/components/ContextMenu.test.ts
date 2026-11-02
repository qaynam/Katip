import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { SpaceName } from "#modules/space"
import { TabId } from "#platform/browser"
import { renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "../testing/view-builders"

const workWithTab = spaceView("work", { temporaryTabs: [tabView(1)] })

const openTabMenu = () => fireEvent.contextMenu(screen.getByRole("button", { name: "Tab 1" }))

describe("Tab context menu", () => {
  it("opens on right-click and closes with Escape", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()
    expect(screen.getByRole("menu", { name: "Tab menu" })).toBeTruthy()

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes when pressing outside the menu", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    await fireEvent.pointerDown(document.body)

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("sends the entry's command and closes the menu when an entry is chosen", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "PinTab", tabId: TabId.make(1) }])
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("moves the tab to the Space chosen under Move to Space", async () => {
    const hobby = spaceView("hobby", { name: SpaceName.make("Hobby") })
    const { connection } = await renderSidebar(sidebarView({ spaces: [workWithTab, hobby] }))
    await openTabMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Move to Space" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Hobby" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "MoveTabToSpace", tabId: TabId.make(1), spaceId: "hobby" },
    ])
  })

  it("hides Move to Space when there is no other Space", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    expect(screen.queryByRole("menuitem", { name: "Move to Space" })).toBeNull()
  })

  it("doesn't offer replacing the bookmark URL for a temporary tab", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()

    expect(
      screen.queryByRole("menuitem", { name: "Replace Pinned URL with Current URL" }),
    ).toBeNull()
  })

  it("moves between entries with the arrow keys", async () => {
    await renderSidebar(sidebarView({ spaces: [workWithTab] }))
    await openTabMenu()
    const menu = screen.getByRole("menu")
    const [first, second] = screen.getAllByRole("menuitem")

    await fireEvent.keyDown(menu, { key: "ArrowDown" })

    expect(first).not.toBe(document.activeElement)
    expect(second).toBe(document.activeElement)
  })
})
