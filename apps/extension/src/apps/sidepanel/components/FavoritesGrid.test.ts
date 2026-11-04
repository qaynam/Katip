import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { FavoriteId } from "#modules/favorites"
import { TabId } from "#platform/browser"
import { renderSidebar } from "../testing/render-sidebar"
import { favoriteView, sidebarView } from "../testing/view-builders"

const favoritesRegion = () => screen.getByRole("region", { name: "Favorites" })

const tile = (name: string) => within(favoritesRegion()).getByRole("button", { name })

describe("Favorites", () => {
  it("activates the tab of an open Favorite", async () => {
    const { connection } = await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "Mail" }), favoriteView(2)] }),
    )

    await fireEvent.click(tile("Mail"))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("opens a closed Favorite in this window", async () => {
    const view = sidebarView({ favorites: [favoriteView(1, { title: "Mail", openTab: null })] })
    const { connection } = await renderSidebar(view)

    await fireEvent.click(tile("Mail"))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenFavorite", windowId: view.windowId, favoriteId: FavoriteId.make("favorite-1") },
    ])
  })

  it("shows closed Favorites apart from open ones", async () => {
    await renderSidebar(
      sidebarView({
        favorites: [
          favoriteView(1, { title: "Mail" }),
          favoriteView(2, { title: "Docs", openTab: null }),
        ],
      }),
    )

    expect(
      ["Mail", "Docs"].map((name) => tile(name).getAttribute("data-favorite-state")),
    ).toStrictEqual(["open", "closed"])
  })

  it("marks the active tab's tile as current", async () => {
    await renderSidebar(
      sidebarView({
        favorites: [
          favoriteView(1, { title: "Mail", openTab: { tabId: TabId.make(1), isActive: true } }),
        ],
      }),
    )

    expect(tile("Mail").getAttribute("aria-current")).toBe("true")
  })

  it("removes a Favorite from its menu", async () => {
    const { connection } = await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "Mail", openTab: null })] }),
    )

    await fireEvent.contextMenu(tile("Mail"))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Remove from Favorites" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RemoveFavorite", favoriteId: FavoriteId.make("favorite-1") },
    ])
  })

  it("closes an open Favorite's tab from its menu, which keeps the Favorite", async () => {
    const { connection } = await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "Mail" })] }),
    )

    await fireEvent.contextMenu(tile("Mail"))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Close" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(1) }])
  })

  it("quietly hints that tabs can be dragged in when empty", async () => {
    await renderSidebar(sidebarView({ favorites: [] }))

    expect(
      within(favoritesRegion()).getByText(/Drag tabs here to add them to Favorites/),
    ).toBeTruthy()
  })
})
