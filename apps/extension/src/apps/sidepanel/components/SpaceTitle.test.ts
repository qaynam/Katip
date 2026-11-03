import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { SpaceName } from "#modules/space"
import { themeOf } from "#modules/theme"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("Work") })
const hobby = spaceView("hobby", { name: SpaceName.make("Hobby") })

const startRenaming = async () => {
  const heading = screen.getByRole("heading", { name: "Work" })
  await fireEvent.dblClick(within(heading).getByRole("button"))
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Space name" })
}

const openSpaceMenu = () => fireEvent.click(screen.getByRole("button", { name: "Space menu" }))

describe("Space name", () => {
  it("edits on double-click and renames on Enter", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: " Day job " } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenameSpace", spaceId: "work", name: "Day job" },
    ])
  })

  it("doesn't rename when canceled with Escape", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: "Day job" } })
    await fireEvent.keyDown(input, { key: "Escape" })

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("doesn't rename to a whitespace-only name", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    const input = await startRenaming()

    await fireEvent.input(input, { target: { value: "   " } })
    await fireEvent.blur(input)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("keeps the typed text when a new view arrives mid-edit", async () => {
    const { pushView } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    const input = await startRenaming()
    await fireEvent.input(input, { target: { value: "Side pro" } })

    await pushView(
      sidebarView({ spaces: [{ ...work, theme: themeOf([{ hue: 20, chroma: 0.8 }]) }, hobby] }),
    )

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Space name" }).value).toBe(
      "Side pro",
    )
  })
})

describe("Space menu", () => {
  it("also opens on right-clicking the name", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))

    await fireEvent.contextMenu(
      within(screen.getByRole("heading", { name: "Work" })).getByRole("button"),
    )

    expect(screen.getByRole("menu", { name: "Space menu" })).toBeTruthy()
  })

  it("opens this Space's theme picker from Edit Theme", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Edit Theme" }))

    expect(screen.getByRole("dialog", { name: "Theme" })).toBeTruthy()
  })

  it("starts renaming from Rename", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Space name" }).value).toBe("Work")
  })

  it("explains that open temporary tabs move to another Space and deletes once confirmed", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Space" }))
    const dialog = await screen.findByRole("alertdialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "Delete Space" }))

    expect(within(dialog).getByText(/they move to another Space/)).toBeTruthy()
    expect(commandsOf(connection.sentCommands, "DeleteSpace")).toStrictEqual([
      { _tag: "DeleteSpace", spaceId: "work" },
    ])
  })

  it("doesn't delete when the confirmation is closed with Escape", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await openSpaceMenu()
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Space" }))
    await screen.findByRole("alertdialog")

    await fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(commandsOf(connection.sentCommands, "DeleteSpace")).toStrictEqual([])
  })

  it("can't delete the last remaining Space", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    expect(screen.getByRole<HTMLButtonElement>("menuitem", { name: "Delete Space" }).disabled).toBe(
      true,
    )
  })

  it("opens the settings", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()

    await fireEvent.click(screen.getByRole("menuitem", { name: "Open Settings" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "OpenSettings" }])
  })

  it("closes when the menu button is pressed again", async () => {
    await renderSidebar(sidebarView({ spaces: [work] }))
    await openSpaceMenu()
    const button = screen.getByRole("button", { name: "Space menu" })

    await fireEvent.pointerDown(button)
    await fireEvent.click(button)

    expect(screen.queryByRole("menu")).toBeNull()
  })
})
