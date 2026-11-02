import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import type { FolderIcon } from "#modules/pinned"
import { BookmarkId } from "#platform/browser"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { pinnedFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithFolder = (icon: FolderIcon | null = null) =>
  sidebarView({
    spaces: [spaceView("work", { pinnedNodes: [pinnedFolder("docs", { title: "Docs", icon })] })],
  })

const folderHeader = () => screen.getByRole("button", { name: "Docs" })

const openPicker = async () => {
  await fireEvent.contextMenu(folderHeader())
  await fireEvent.click(screen.getByRole("menuitem", { name: "Change Icon" }))
  return screen.getByRole("dialog", { name: "Folder icon" })
}

describe("Changing a folder's icon", () => {
  it("opens a popover with the default icon and the available icons from the folder menu", async () => {
    await renderSidebar(viewWithFolder())

    const picker = await openPicker()

    const names = within(picker)
      .getAllByRole("button")
      .map((choice) => choice.getAttribute("aria-label"))
    expect(names.slice(0, 3)).toStrictEqual(["Default icon", "Star", "Bookmark"])
    expect(names).toHaveLength(25)
  })

  it("asks to set the chosen icon on the folder and closes the popover", async () => {
    const { connection } = await renderSidebar(viewWithFolder())
    await openPicker()

    await fireEvent.click(screen.getByRole("button", { name: "Planet" }))

    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([
      { _tag: "SetFolderIcon", bookmarkId: BookmarkId.make("docs"), icon: "planet" },
    ])
    expect(screen.queryByRole("dialog", { name: "Folder icon" })).toBeNull()
  })

  it("asks to go back to the folder glyph when the default icon is chosen", async () => {
    const { connection } = await renderSidebar(viewWithFolder("star"))
    await openPicker()

    await fireEvent.click(screen.getByRole("button", { name: "Default icon" }))

    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([
      { _tag: "SetFolderIcon", bookmarkId: BookmarkId.make("docs"), icon: null },
    ])
  })

  it("marks only the current icon as selected", async () => {
    await renderSidebar(viewWithFolder("star"))
    const picker = await openPicker()

    const pressed = within(picker)
      .getAllByRole("button", { pressed: true })
      .map((choice) => choice.getAttribute("aria-label"))
    expect(pressed).toStrictEqual(["Star"])
  })

  it("focuses the current icon on open and moves focus sideways and between rows with the arrow keys", async () => {
    await renderSidebar(viewWithFolder("star"))
    await openPicker()
    const focusedName = () => document.activeElement?.getAttribute("aria-label")
    const opened = focusedName()

    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" })
    const afterRight = focusedName()
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" })

    expect([opened, afterRight, focusedName()]).toStrictEqual(["Star", "Bookmark", "Bell"])
  })

  it("closes the popover with Escape without asking for anything and returns focus to the folder", async () => {
    const { connection } = await renderSidebar(viewWithFolder())
    await openPicker()

    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "Folder icon" })).toBeNull()
    expect(commandsOf(connection.sentCommands, "SetFolderIcon")).toStrictEqual([])
    expect(document.activeElement).toBe(folderHeader())
  })

  it("shows the chosen icon instead of the folder glyph in the folder's header", async () => {
    await renderSidebar(viewWithFolder("moon"))

    const shown = folderHeader().querySelector<HTMLElement>("[data-folder-icon]")

    expect(shown?.dataset["folderIcon"]).toBe("moon")
  })
})
