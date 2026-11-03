import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { PinnedNodeView, SidebarCommand } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
} from "../testing/view-builders"

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const pinnedRegion = () => screen.getByRole("region", { name: "Pinned" })

describe("Folders", () => {
  it("hides the contents of a collapsed folder and shows only the peeked items below its header", async () => {
    const active = pinnedItem("active", {
      title: "Open doc",
      openTab: openPinnedTab(tabView(1, { isActive: true })),
    })
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "Docs",
          isExpanded: false,
          children: [pinnedItem("hidden", { title: "Hidden doc" }), active],
          peekedItems: [active],
        }),
      ),
    )

    expect(within(pinnedRegion()).queryByText("Hidden doc")).toBeNull()
    expect(within(pinnedRegion()).getByText("Open doc")).toBeTruthy()
  })

  it("shows a peeked split pin below a collapsed folder as the same single side-by-side row as when open", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", {
        title: "Design doc",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(3) })),
      }),
      pinnedItem("right", { title: "Preview" }),
    ])
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "Docs",
          isExpanded: false,
          children: [pair],
          peekedItems: [pair],
        }),
      ),
    )

    const rowOf = (title: string) => screen.getByRole("button", { name: title }).closest("li")

    expect(rowOf("Design doc")).not.toBeNull()
    expect(rowOf("Design doc")).toBe(rowOf("Preview"))
  })

  it("moves a peeked split pin out of the folder by dragging", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", {
        title: "Design doc",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(3) })),
      }),
      pinnedItem("right", { title: "Preview" }),
    ])
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          title: "Docs",
          isExpanded: false,
          children: [pair],
          peekedItems: [pair],
        }),
        pinnedItem("after", { title: "Next pin" }),
      ),
    )
    const rowOf = (title: string) =>
      screen.getByRole("button", { name: title }).closest("li") as HTMLElement

    await fireEvent.dragStart(rowOf("Design doc"))
    await dragOverAt(rowOf("Next pin"), 0.9)
    await fireEvent.drop(rowOf("Next pin"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("pair"),
        placement: { spaceId: "work", parentId: null, index: 2 },
      },
    ])
  })

  it("shows all the contents of an expanded folder", async () => {
    await renderSidebar(
      viewWithPins(
        pinnedFolder("folder", {
          isExpanded: true,
          children: [pinnedItem("a", { title: "Doc A" }), pinnedItem("b", { title: "Doc B" })],
        }),
      ),
    )

    expect(within(pinnedRegion()).getByText("Doc A")).toBeTruthy()
    expect(within(pinnedRegion()).getByText("Doc B")).toBeTruthy()
  })

  it("toggles expansion when the header is clicked", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "Docs", isExpanded: false })),
    )

    await fireEvent.click(screen.getByRole("button", { name: "Docs" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("folder"), isExpanded: true },
    ])
  })

  it("shows a created folder with its name ready to edit", async () => {
    const created = pinnedFolder("created", { title: "Untitled" })
    const { connection } = await renderSidebar(viewWithPins(), {
      respond: (command) => ({
        outcome: {
          _tag: "Succeeded",
          createdBookmarkId: command._tag === "CreateFolder" ? created.bookmarkId : null,
        },
        view: viewWithPins(created),
      }),
    })

    await fireEvent.click(screen.getByRole("button", { name: "Space menu" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "New Folder" }))
    await tick()

    expect(connection.sentCommands).toContainEqual({
      _tag: "CreateFolder",
      spaceId: "work",
      parentId: null,
    })
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Folder name" }).value).toBe(
      "Untitled",
    )
  })

  it("hides New Folder in the menu of a folder that can't have subfolders", async () => {
    await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "Docs", canCreateSubfolder: false })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Docs" }))

    expect(screen.queryByRole("menuitem", { name: "New Folder" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "Delete Folder" })).toBeTruthy()
  })

  it("deletes only once deletion is confirmed in the dialog", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedFolder("folder", { title: "Docs" })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Docs" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Folder" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Delete" }))

    expect(commandsOf(connection.sentCommands, "DeleteFolder")).toStrictEqual([
      { _tag: "DeleteFolder", bookmarkId: BookmarkId.make("folder") },
    ])
  })
})

describe("Closed pins", () => {
  it("opens the pin in this window when clicked", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedItem("pin", { title: "Design doc" })),
    )

    await fireEvent.click(screen.getByRole("button", { name: "Design doc" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("pin") },
    ])
  })

  it("has no close button and isn't deleted by a middle click", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedItem("pin", { title: "Design doc" })),
    )
    const row = screen.getByRole("button", { name: "Design doc" }).closest("li")

    await fireEvent(row as HTMLElement, new MouseEvent("auxclick", { button: 1, bubbles: true }))

    expect(within(row as HTMLElement).queryByRole("button", { name: "Close Tab" })).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("asks for confirmation before deleting from the context menu and keeps the pin when canceled", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedItem("pin", { title: "Design doc" })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Design doc" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Pinned Tab" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    expect(commandsOf(connection.sentCommands, "RemovePinnedItem")).toStrictEqual([])
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("renames the pin when renamed by double-clicking", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(pinnedItem("pin", { title: "Design doc" })),
    )

    await fireEvent.dblClick(screen.getByRole("button", { name: "Design doc" }))
    const input = screen.getByRole("textbox", { name: "Name" })
    await fireEvent.input(input, { target: { value: "Design doc v2" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("pin"), title: "Design doc v2" },
    ])
  })
})

describe("Open pins", () => {
  it("prefixes the name with / and turns the favicon into a way back after navigating away from the pinned URL", async () => {
    const tab = tabView(5, { title: "Search results" })
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedItem("pin", {
          title: "Documentation",
          openTab: openPinnedTab(tab, { hasNavigatedAway: true }),
        }),
      ),
    )
    const row = screen.getByRole("button", { name: "Documentation" }).closest("li") as HTMLElement

    await fireEvent.click(within(row).getByRole("button", { name: "Go back to the pinned URL" }))

    expect(within(row).getByText("/")).toBeTruthy()
    expect(connection.sentCommands).toStrictEqual<ReadonlyArray<SidebarCommand>>([
      { _tag: "ResetPinnedTab", tabId: TabId.make(5) },
    ])
  })

  it("keeps the pin's name on the row after navigating away and shows the page title on hover", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const tab = tabView(5, { title: "Search results" })
    await renderSidebar(
      viewWithPins(
        pinnedItem("pin", {
          title: "Documentation",
          openTab: openPinnedTab(tab, { hasNavigatedAway: true }),
        }),
      ),
    )
    const row = screen.getByRole("button", { name: "Documentation" }).closest("li") as HTMLElement

    await fireEvent.pointerEnter(row, { clientX: 40, clientY: 60, pointerId: 1 })
    vi.advanceTimersByTime(1_000)
    await tick()
    vi.useRealTimers()

    expect(screen.getByRole("tooltip").textContent).toContain("Search results")
  })

  it("shows no go-back button while at the pinned URL", async () => {
    await renderSidebar(
      viewWithPins(
        pinnedItem("pin", { title: "Documentation", openTab: openPinnedTab(tabView(5)) }),
      ),
    )

    expect(screen.queryByRole("button", { name: "Go back to the pinned URL" })).toBeNull()
  })

  it("replaces the bookmark URL with the current page's URL from the menu", async () => {
    const { connection } = await renderSidebar(
      viewWithPins(
        pinnedItem("pin", { title: "Documentation", openTab: openPinnedTab(tabView(5)) }),
      ),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Documentation" }))
    await fireEvent.click(
      screen.getByRole("menuitem", { name: "Replace Pinned URL with Current URL" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "ReplacePinnedUrl", tabId: TabId.make(5) },
    ])
  })
})

describe("Pinned split views", () => {
  const openSplit = (splitViewId: number) =>
    pinnedSplit("split", [
      pinnedItem("left", {
        title: "Design doc",
        openTab: openPinnedTab(tabView(5, { splitViewId: SplitViewId.make(splitViewId) })),
      }),
      pinnedItem("right", {
        title: "Preview",
        openTab: openPinnedTab(tabView(6, { splitViewId: SplitViewId.make(splitViewId) })),
      }),
    ])
  const closedSplit = pinnedSplit("split", [
    pinnedItem("left", { title: "Design doc" }),
    pinnedItem("right", { title: "Preview" }),
  ])
  const rowOf = (title: string) =>
    screen.getByRole("button", { name: title }).closest("li") as HTMLElement

  it("shows the two pins side by side in a single row, even inside a folder", async () => {
    await renderSidebar(viewWithPins(pinnedFolder("folder", { children: [closedSplit] })))

    expect(rowOf("Design doc")).toBe(rowOf("Preview"))
  })

  it("activates the tab of the open half when clicked", async () => {
    const { connection } = await renderSidebar(viewWithPins(openSplit(9)))

    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(6) }])
  })

  it("opens both as a split view when closed, whichever half is clicked", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedSplit))

    await fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("split") },
    ])
  })

  it("shows no close button on a closed half", async () => {
    await renderSidebar(viewWithPins(closedSplit))

    expect(screen.queryByRole("button", { name: "Close Tab" })).toBeNull()
  })

  it("renames the pin on the right-clicked half with Rename", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedSplit))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Preview" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }))
    const input = screen.getByRole("textbox", { name: "Name" })
    await fireEvent.input(input, { target: { value: "Staging" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RenamePinnedItem", bookmarkId: BookmarkId.make("right"), title: "Staging" },
    ])
  })

  it("deletes the whole pinned split view with Delete Pinned Tab, only once confirmed", async () => {
    const { connection } = await renderSidebar(viewWithPins(openSplit(9)))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Design doc" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Delete Pinned Tab" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Delete" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RemovePinnedItem", bookmarkId: BookmarkId.make("split") },
    ])
  })

  it("unpins it and places it there as a split view when open and dropped on a temporary tab row", async () => {
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [spaceView("work", { pinnedNodes: [openSplit(9)], temporaryTabs: [tabView(1)] })],
      }),
    )

    await fireEvent.dragStart(rowOf("Design doc"))
    await dragOverAt(rowOf("Tab 1"), 0.9)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInTemporary",
        splitViewId: SplitViewId.make(9),
        spaceId: "work",
        placement: { _tag: "Below", tabId: TabId.make(1) },
      },
    ])
  })

  it("does nothing when closed and dropped on a temporary tab row", async () => {
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [spaceView("work", { pinnedNodes: [closedSplit], temporaryTabs: [tabView(1)] })],
      }),
    )

    await fireEvent.dragStart(rowOf("Design doc"))
    await dragOverAt(rowOf("Tab 1"), 0.9)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("When pinned tabs can't be loaded", () => {
  it("offers a reload instead of looking empty", async () => {
    const { onReload } = await renderSidebar(
      sidebarView({ spaces: [spaceView("work", { pinned: { _tag: "Unavailable" } })] }),
    )

    await fireEvent.click(screen.getByRole("button", { name: "Reload" }))

    expect(screen.queryByText("Drag tabs here to pin them")).toBeNull()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it("hints that tabs can be dragged in when nothing is pinned", async () => {
    await renderSidebar(viewWithPins())

    expect(screen.getByText("Drag tabs here to pin them")).toBeTruthy()
  })
})

describe("While dragging", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("expands a collapsed folder after hovering over its header for 250ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(
      sidebarView({
        spaces: [
          spaceView("work", {
            pinnedNodes: [pinnedFolder("folder", { title: "Docs", isExpanded: false })],
            temporaryTabs: [tabView(1)],
          }),
        ],
      }),
    )
    const expandCommands = () => commandsOf(connection.sentCommands, "SetFolderExpanded")
    await fireEvent.dragStart(
      screen.getByRole("button", { name: "Tab 1" }).closest("li") as HTMLElement,
    )
    await fireEvent.dragOver(screen.getByRole("button", { name: "Docs" }))

    vi.advanceTimersByTime(249)
    expect(expandCommands()).toStrictEqual([])
    vi.advanceTimersByTime(1)

    expect(expandCommands()).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("folder"), isExpanded: true },
    ])
  })
})
