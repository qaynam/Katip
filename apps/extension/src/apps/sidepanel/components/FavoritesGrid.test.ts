import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import { renderSidebar } from "../testing/render-sidebar"
import { favoriteView, sidebarView } from "../testing/view-builders"

const favoritesRegion = () => screen.getByRole("region", { name: "Favorites" })

describe("Favorites", () => {
  it("activates the clicked tab", async () => {
    const { connection } = await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "Mail" }), favoriteView(2)] }),
    )

    await fireEvent.click(within(favoritesRegion()).getByRole("button", { name: "Mail" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("marks the active tab's tile as current", async () => {
    await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "Mail", isActive: true })] }),
    )

    const tile = within(favoritesRegion()).getByRole("button", { name: "Mail" })

    expect(tile.getAttribute("aria-current")).toBe("true")
  })

  it("quietly hints that tabs can be dragged in when empty", async () => {
    await renderSidebar(sidebarView({ favorites: [] }))

    expect(
      within(favoritesRegion()).getByText(/Drag tabs here to add them to Favorites/),
    ).toBeTruthy()
  })
})
