import { fireEvent, screen, within } from "@testing-library/svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CommandResponse } from "./connection/memory-connection"
import { renderSidebar } from "./testing/render-sidebar"
import {
  favoriteView,
  openPinnedTab,
  pinnedItem,
  sidebarView,
  spaceView,
  tabView,
} from "./testing/view-builders"

/** Temporary tabs 1 to 3, a pin open in tab 4 and a Favorite open in tab 5. */
const viewWithActive = (activeId: number) => {
  const tab = (id: number) => tabView(id, { isActive: id === activeId })
  return sidebarView({
    spaces: [
      spaceView("work", {
        pinnedNodes: [pinnedItem("docs", { title: "Docs", openTab: openPinnedTab(tab(4)) })],
        temporaryTabs: [tab(1), tab(2), tab(3)],
      }),
    ],
    favorites: [
      favoriteView(5, {
        title: "Mail",
        openTab: { tabId: tab(5).tabId, isActive: activeId === 5 },
      }),
    ],
  })
}

const isShownActive = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-current") === "true"

const failToSwitch = (): CommandResponse => ({
  outcome: { _tag: "Failed", reason: "The tab was closed" },
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Switching tabs from the side panel", () => {
  it("shows the clicked tab as the active one before the background's view comes back", async () => {
    await renderSidebar(viewWithActive(1))

    await fireEvent.click(screen.getByRole("button", { name: "Tab 2" }))

    expect(isShownActive("Tab 2")).toBe(true)
    expect(isShownActive("Tab 1")).toBe(false)
  })

  it("shows a pinned tab and a Favorite as active as soon as they are clicked", async () => {
    await renderSidebar(viewWithActive(1))

    await fireEvent.click(screen.getByRole("button", { name: "Docs" }))
    expect(isShownActive("Docs")).toBe(true)

    await fireEvent.click(
      within(screen.getByRole("region", { name: "Favorites" })).getByRole("button", {
        name: "Mail",
      }),
    )
    expect(isShownActive("Mail")).toBe(true)
    expect(isShownActive("Docs")).toBe(false)
  })

  it("keeps the clicked tab active through views sent before the switch reached the browser", async () => {
    const { pushView } = await renderSidebar(viewWithActive(1))
    await fireEvent.click(screen.getByRole("button", { name: "Tab 2" }))

    await pushView(viewWithActive(1))

    expect(isShownActive("Tab 2")).toBe(true)
  })

  it("follows the background's view again once it shows the switch", async () => {
    const { pushView } = await renderSidebar(viewWithActive(1))
    await fireEvent.click(screen.getByRole("button", { name: "Tab 2" }))
    await pushView(viewWithActive(2))

    await pushView(viewWithActive(3))

    expect(isShownActive("Tab 3")).toBe(true)
    expect(isShownActive("Tab 2")).toBe(false)
  })

  it("goes back to the tab that was active when the switch fails", async () => {
    await renderSidebar(viewWithActive(1), { respond: failToSwitch })

    await fireEvent.click(screen.getByRole("button", { name: "Tab 2" }))

    expect(isShownActive("Tab 1")).toBe(true)
    expect(isShownActive("Tab 2")).toBe(false)
  })

  it("shows the tab the background says is active when the switch isn't confirmed within a second", async () => {
    vi.useFakeTimers()
    await renderSidebar(viewWithActive(1))
    await fireEvent.click(screen.getByRole("button", { name: "Tab 2" }))

    await vi.advanceTimersByTimeAsync(1_000)

    expect(isShownActive("Tab 1")).toBe(true)
    expect(isShownActive("Tab 2")).toBe(false)
  })
})
