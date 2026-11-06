import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import type { Release } from "#modules/updates"
import { commandsOf, renderSidebar } from "./testing/render-sidebar"
import { sidebarView } from "./testing/view-builders"

const release: Release = {
  version: "1.3.0",
  pageUrl: "https://github.com/qaynam/Katip/releases/tag/v1.3.0",
  publishedAt: "2026-11-20T09:00:00Z",
}

describe("Telling about a newer release", () => {
  it("shows a card at the bottom of the side panel naming the new version", async () => {
    await renderSidebar(sidebarView(), { updateNotice: release })

    expect(await screen.findByRole("region", { name: "Katip 1.3.0 is available" })).toBeTruthy()
  })

  it("shows no card when there's no newer release", async () => {
    await renderSidebar(sidebarView())

    expect(screen.queryByRole("region", { name: /is available/ })).toBeNull()
  })

  it("opens the release's page when asked what's new, and doesn't tell about it again", async () => {
    const { connection, updateNotices } = await renderSidebar(sidebarView(), {
      updateNotice: release,
    })

    await fireEvent.click(await screen.findByRole("button", { name: "See what’s new" }))

    expect(commandsOf(connection.sentCommands, "OpenUrl")).toMatchObject([{ url: release.pageUrl }])
    expect(screen.queryByRole("region", { name: "Katip 1.3.0 is available" })).toBeNull()
    expect(updateNotices.dismissed).toStrictEqual(["1.3.0"])
  })

  it("stops telling about the release once the card is dismissed", async () => {
    const { updateNotices } = await renderSidebar(sidebarView(), { updateNotice: release })

    await fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }))

    expect(screen.queryByRole("region", { name: "Katip 1.3.0 is available" })).toBeNull()
    expect(updateNotices.dismissed).toStrictEqual(["1.3.0"])
  })
})
