import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import type { CommandResponse } from "./connection/memory-connection"
import { renderSidebar } from "./testing/render-sidebar"
import {
  liveItem,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  sidebarView,
  spaceView,
} from "./testing/view-builders"

/** A folder "Reading" holding the pin "Docs", open or closed. */
const viewWithFolder = (isExpanded: boolean) =>
  sidebarView({
    spaces: [
      spaceView("work", {
        pinnedNodes: [
          pinnedFolder("reading", {
            title: "Reading",
            isExpanded,
            children: [pinnedItem("docs", { title: "Docs" })],
          }),
        ],
      }),
    ],
  })

const folderHeader = () => screen.getByRole("button", { name: "Reading" })
const isOpen = () => folderHeader().getAttribute("aria-expanded") === "true"
const showsDocs = () => screen.queryByRole("button", { name: "Docs" }) !== null

const failToChange = (): CommandResponse => ({
  outcome: { _tag: "Failed", reason: "The folder was removed" },
})

describe("Opening and closing a folder", () => {
  it("opens it and shows what's inside as soon as its header is clicked", async () => {
    await renderSidebar(viewWithFolder(false))

    await fireEvent.click(folderHeader())

    expect([isOpen(), showsDocs()]).toStrictEqual([true, true])
  })

  it("draws its icon open as soon as its header is clicked", async () => {
    const { container } = await renderSidebar(viewWithFolder(false))

    await fireEvent.click(folderHeader())

    expect(container.querySelector("[data-folder-glyph]")?.getAttribute("data-folder-glyph")).toBe(
      "open",
    )
  })

  it("stays open through views sent before the change reached the background", async () => {
    const { pushView } = await renderSidebar(viewWithFolder(false))
    await fireEvent.click(folderHeader())

    await pushView(viewWithFolder(false))

    expect(isOpen()).toBe(true)
  })

  it("follows the background's view again once it shows the change", async () => {
    const { pushView } = await renderSidebar(viewWithFolder(false))
    await fireEvent.click(folderHeader())
    await pushView(viewWithFolder(true))

    await pushView(viewWithFolder(false))

    expect([isOpen(), showsDocs()]).toStrictEqual([false, false])
  })

  it("closes again when opening it fails", async () => {
    await renderSidebar(viewWithFolder(false), { respond: failToChange })

    await fireEvent.click(folderHeader())

    expect([isOpen(), showsDocs()]).toStrictEqual([false, false])
  })

  it("opens a live folder as soon as its header is clicked too", async () => {
    await renderSidebar(
      sidebarView({
        spaces: [
          spaceView("work", {
            pinnedNodes: [
              pinnedLiveFolder("inbox", {
                title: "Inbox",
                isExpanded: false,
                items: [liveItem("mail", { title: "Lunch on Friday" })],
              }),
            ],
          }),
        ],
      }),
    )

    await fireEvent.click(screen.getByRole("button", { name: /^Inbox/ }))

    expect(screen.getByText("Lunch on Friday")).toBeTruthy()
  })
})
