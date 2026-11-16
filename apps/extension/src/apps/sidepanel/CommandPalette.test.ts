import { screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import { renderSidebar } from "./testing/render-sidebar"
import { sidebarView, spaceView } from "./testing/view-builders"

const view = sidebarView({ spaces: [spaceView("work")] })

describe("Requests from the Command Palette", () => {
  it("shows the downloads in place of the Space when asked", async () => {
    const { connection } = await renderSidebar(view)

    connection.pushShowPanel("Downloads")
    await tick()

    expect([
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      screen.queryByRole("navigation", { name: "Switch Space" }),
    ]).toStrictEqual([true, null])
  })

  it("shows the downloads without asking for access, which the side panel asks for itself", async () => {
    const { connection, downloads } = await renderSidebar(view, {
      downloads: { access: "NotAsked" },
    })

    connection.pushShowPanel("Downloads")
    await tick()

    expect([
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      downloads.requestCount,
    ]).toStrictEqual([true, 0])
  })

  it("closes the side panel of its window when asked", async () => {
    const { connection, sidePanel } = await renderSidebar(view)

    connection.pushCloseSidePanel()
    await tick()

    expect(sidePanel.closedIn).toStrictEqual([1])
  })
})
