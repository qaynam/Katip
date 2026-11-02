import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView, SidebarCommand } from "#protocol"
import type { CommandResponse } from "../connection/memory-connection"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { pinnedFolder, sidebarView, spaceView } from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const createdLiveFolder = (command: SidebarCommand): CommandResponse => ({
  outcome: {
    _tag: "Succeeded",
    createdBookmarkId: command._tag === "CreateLiveFolder" ? BookmarkId.make("created") : null,
  },
})

const chooseFromSpaceMenu = async (source: "Gmail" | "GitHub") => {
  await fireEvent.click(screen.getByRole("button", { name: "Space menu" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "Add Live Folder" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: source }))
}

const chooseFromFolderMenu = async (folderTitle: string, source: "Gmail" | "GitHub") => {
  await fireEvent.contextMenu(screen.getByRole("button", { name: folderTitle }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "Add Live Folder" }))
  await fireEvent.click(screen.getByRole("menuitem", { name: source }))
}

const fillIn = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } })

describe("Creating a Gmail live folder", () => {
  it("asks for access to Gmail, then creates the folder with the entered account and label", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins(), {
      respond: createdLiveFolder,
    })

    await chooseFromSpaceMenu("Gmail")
    await fillIn("Account number", "1")
    await fillIn("Label", "Work")
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://mail.google.com/*"]])
    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: null,
          source: { _tag: "Gmail", accountIndex: 1, label: "Work" },
        },
      ]),
    )
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("uses the first account's inbox when created without changes", async () => {
    const { connection } = await renderSidebar(viewWithPins(), { respond: createdLiveFolder })

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await vi.waitFor(() =>
      expect(commandsOf(connection.sentCommands, "CreateLiveFolder")).toMatchObject([
        { source: { _tag: "Gmail", accountIndex: 0, label: null } },
      ]),
    )
  })

  it("keeps the dialog open and explains that access is needed when access is denied, without creating anything", async () => {
    const { connection } = await renderSidebar(viewWithPins(), { grantsAccess: false })

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("access to Gmail wasn’t allowed"),
    )
    expect(connection.sentCommands).toStrictEqual([])
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("explains how to fix a non-integer account number without asking for access", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("Gmail")
    await fillIn("Account number", "one")
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a whole number of 0 or more for the account number",
    )
    expect(originAccess.requestedOrigins).toStrictEqual([])
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("creates nothing when canceled", async () => {
    const { connection } = await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("Creating a GitHub live folder", () => {
  it("asks for access to github.com to use the browser's sign-in, then creates the folder of the chosen kind", async () => {
    const { connection, originAccess } = await renderSidebar(viewWithPins(), {
      respond: createdLiveFolder,
    })

    await chooseFromSpaceMenu("GitHub")
    await fireEvent.click(screen.getByRole("radio", { name: "Assigned Issues" }))
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(originAccess.requestedOrigins).toStrictEqual([["https://github.com/*"]])
    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: null,
          source: { _tag: "GitHub", query: "assigned-issues" },
        },
      ]),
    )
  })

  it("doesn't ask for a token", async () => {
    await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("GitHub")

    expect(screen.queryByLabelText("Access token")).toBeNull()
    expect(screen.queryByRole("link", { name: "Create a token on github.com" })).toBeNull()
  })

  it("explains that it works when signed in to GitHub in the browser", async () => {
    await renderSidebar(viewWithPins())

    await chooseFromSpaceMenu("GitHub")

    expect(screen.getByRole("dialog").textContent).toContain(
      "Works when you’re signed in to GitHub in this browser.",
    )
  })
})

describe("Creating a live folder inside a folder", () => {
  it("creates it inside that folder and expands the folder if it was collapsed", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("docs", { title: "Docs", isExpanded: false })),
      { respond: createdLiveFolder },
    )

    await chooseFromFolderMenu("Docs", "Gmail")
    await fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await vi.waitFor(() =>
      expect(connection.sentCommands).toStrictEqual([
        {
          _tag: "CreateLiveFolder",
          spaceId: "work",
          parentId: BookmarkId.make("docs"),
          source: { _tag: "Gmail", accountIndex: 0, label: null },
        },
        { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("docs"), isExpanded: true },
      ]),
    )
  })

  it("isn't offered in the menu of a folder that can't have subfolders", async () => {
    await renderSidebar(
      viewWithPins(pinnedFolder("docs", { title: "Docs", canCreateSubfolder: false })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Docs" }))

    expect(screen.queryByRole("menuitem", { name: "Add Live Folder" })).toBeNull()
  })
})
