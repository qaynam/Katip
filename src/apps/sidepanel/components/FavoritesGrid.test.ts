import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import { renderSidebar } from "../testing/render-sidebar"
import { favoriteView, sidebarView } from "../testing/view-builders"

const favoritesRegion = () => screen.getByRole("region", { name: "Favorites" })

describe("Favorites", () => {
  it("押したタブをアクティブにする", async () => {
    const { connection } = await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "メール" }), favoriteView(2)] }),
    )

    await fireEvent.click(within(favoritesRegion()).getByRole("button", { name: "メール" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("アクティブなタブのタイルが選ばれた状態になる", async () => {
    await renderSidebar(
      sidebarView({ favorites: [favoriteView(1, { title: "メール", isActive: true })] }),
    )

    const tile = within(favoritesRegion()).getByRole("button", { name: "メール" })

    expect(tile.getAttribute("aria-current")).toBe("true")
  })

  it("空のときは、ドラッグで追加できることを説明する", async () => {
    await renderSidebar(sidebarView({ favorites: [] }))

    expect(within(favoritesRegion()).getByText(/ここにドラッグすると/)).toBeTruthy()
  })
})
