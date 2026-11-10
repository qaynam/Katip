import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { TemporaryEntry } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  pinnedFolder,
  pinnedItem,
  sidebarView,
  spaceView,
  tabView,
  temporarySplit,
  temporaryTab,
} from "../testing/view-builders"

const viewWithTabs = (...tabs: ReadonlyArray<ReturnType<typeof tabView>>) =>
  sidebarView({ spaces: [spaceView("work", { temporaryTabs: tabs })] })

const viewWithEntries = (
  entries: ReadonlyArray<TemporaryEntry>,
  options: { readonly canSplit?: boolean } = {},
) =>
  sidebarView({
    spaces: [
      spaceView("work", {
        temporaryEntries: entries,
        pinnedNodes: [pinnedItem("existing"), pinnedFolder("folder", { title: "Docs" })],
      }),
    ],
    canSplit: options.canSplit ?? true,
  })

const redditAndGoogle = temporarySplit(
  9,
  tabView(1, { title: "Reddit" }),
  tabView(2, { title: "Google" }),
)

const rowOf = (title: string) => {
  const row = screen.getByRole("button", { name: title }).closest("li")
  if (row === null) throw new Error(`No row for ${title}`)
  return row
}

describe("Temporary tab rows", () => {
  it("activates the tab when clicked", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent.click(screen.getByRole("button", { name: "Tab 1" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("closes the tab with ×", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.click(within(rowOf("Tab 2")).getByRole("button", { name: "Close Tab" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(2) }])
  })

  it("mutes a tab playing sound with its speaker, and unmutes a muted one", async () => {
    const { connection } = await renderSidebar(
      viewWithTabs(tabView(1, { isAudible: true }), tabView(2, { isMuted: true })),
    )

    await fireEvent.click(within(rowOf("Tab 1")).getByRole("button", { name: "Mute Tab" }))
    await fireEvent.click(within(rowOf("Tab 2")).getByRole("button", { name: "Unmute Tab" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetTabMuted", tabId: TabId.make(1), muted: true },
      { _tag: "SetTabMuted", tabId: TabId.make(2), muted: false },
    ])
  })

  it("mutes one half of a split view with that half's speaker", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([
        temporarySplit(
          9,
          tabView(1, { title: "Reddit" }),
          tabView(2, { title: "Google", isAudible: true }),
        ),
      ]),
    )

    await fireEvent.click(screen.getByRole("button", { name: "Mute Tab" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetTabMuted", tabId: TabId.make(2), muted: true },
    ])
  })

  it("closes the tab on middle click", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent(rowOf("Tab 1"), new MouseEvent("auxclick", { button: 1, bubbles: true }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(1) }])
  })

  it("closes all temporary tabs of the active Space with Clear", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1)))

    await fireEvent.click(screen.getByRole("button", { name: "Clear" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "CloseTemporaryTabs", windowId: 1, spaceId: "work" },
    ])
  })

  it("hides Clear when there are no temporary tabs", async () => {
    await renderSidebar(viewWithTabs())

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull()
  })
})

describe("Temporary split view rows", () => {
  it("shows the two tabs side by side in a single row", async () => {
    await renderSidebar(viewWithEntries([redditAndGoogle, temporaryTab(tabView(3))]))

    expect(rowOf("Reddit")).toBe(rowOf("Google"))
    expect(rowOf("Tab 3")).not.toBe(rowOf("Reddit"))
  })

  it("activates the left tab when the left half is clicked", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.click(screen.getByRole("button", { name: "Reddit" }))

    expect(connection.sentCommands).toStrictEqual([{ _tag: "ActivateTab", tabId: TabId.make(1) }])
  })

  it("closes only the right tab with the × on the right half", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.click(
      within(screen.getByRole("group", { name: "Google" })).getByRole("button", {
        name: "Close Tab",
      }),
    )

    expect(connection.sentCommands).toStrictEqual([{ _tag: "CloseTab", tabId: TabId.make(2) }])
  })

  it("puts the two tabs back in separate rows with Separate Tabs in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Google" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Separate Tabs" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "Unsplit", splitViewId: SplitViewId.make(9) },
    ])
  })

  it("adds the split view as is to the end of pinned tabs with Pin in the context menu", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Reddit" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInPinned",
        splitViewId: SplitViewId.make(9),
        placement: { spaceId: "work", parentId: null, index: 2 },
      },
    ])
  })

  it("hides Separate Tabs where split views aren't available", async () => {
    await renderSidebar(viewWithEntries([redditAndGoogle], { canSplit: false }))

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Reddit" }))

    expect(screen.queryByRole("menuitem", { name: "Separate Tabs" })).toBeNull()
  })
})

describe("Row tooltips", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const hover = (title: string) =>
    fireEvent.pointerEnter(rowOf(title), { clientX: 40, clientY: 60, pointerId: 1 })

  it("shows the title and how to rename after hovering for a while", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await renderSidebar(viewWithTabs(tabView(1, { title: "Inbox" })))

    await hover("Inbox")
    vi.advanceTimersByTime(1_000)
    await tick()

    const tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("Inbox")
    expect(tooltip.textContent).toContain("Double-click to rename")
  })

  it("shows no tooltip when the pointer leaves right away", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    await renderSidebar(viewWithTabs(tabView(1, { title: "Inbox" })))

    await hover("Inbox")
    await fireEvent.pointerLeave(rowOf("Inbox"))
    vi.advanceTimersByTime(1_000)
    await tick()

    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})

describe("Renaming a tab", () => {
  const startEditing = async (title: string) => {
    await fireEvent.dblClick(screen.getByRole("button", { name: title }))
    return screen.getByRole("textbox", { name: "Name" })
  }

  it("edits on double-click and sets the new name on Enter", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "Inbox" })))
    const input = await startEditing("Inbox")

    await fireEvent.input(input, { target: { value: "Mail" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([
      { _tag: "RenameTab", tabId: TabId.make(1), title: "Mail" },
    ])
  })

  it("clears the custom name when committed empty", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "Mail" })))
    const input = await startEditing("Mail")

    await fireEvent.input(input, { target: { value: "" } })
    await fireEvent.blur(input)

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([
      { _tag: "RenameTab", tabId: TabId.make(1), title: "" },
    ])
  })

  it("keeps the name when canceled with Escape", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1, { title: "Mail" })))
    const input = await startEditing("Mail")

    await fireEvent.input(input, { target: { value: "Another name" } })
    await fireEvent.keyDown(input, { key: "Escape" })

    expect(commandsOf(connection.sentCommands, "RenameTab")).toStrictEqual([])
    expect(screen.getByRole("button", { name: "Mail" })).toBeTruthy()
  })

  it("keeps the typed text when a new view arrives mid-edit", async () => {
    const { pushView } = await renderSidebar(viewWithTabs(tabView(1, { title: "Mail" })))
    const input = await startEditing("Mail")
    await fireEvent.input(input, { target: { value: "Half-typed na" } })

    await pushView(viewWithTabs(tabView(1, { title: "Mail (3)", isLoading: true }), tabView(2)))

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe(
      "Half-typed na",
    )
  })
})

describe("Scrolling to the active tab", () => {
  it("scrolls the row into view when another tab becomes active", async () => {
    const { pushView } = await renderSidebar(
      viewWithTabs(tabView(1, { isActive: true }), tabView(2)),
    )
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    await pushView(viewWithTabs(tabView(1), tabView(2, { isActive: true })))

    expect(scrollIntoView.mock.contexts).toStrictEqual([rowOf("Tab 2")])
  })

  it("doesn't scroll when only the loading state changes", async () => {
    const { pushView } = await renderSidebar(
      viewWithTabs(tabView(1, { isActive: true }), tabView(2)),
    )
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    await pushView(viewWithTabs(tabView(1, { isActive: true }), tabView(2, { isLoading: true })))
    await tick()

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe("Drag and drop", () => {
  it("reorders a temporary tab above another when dropped on its top edge", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragStart(rowOf("Tab 2"))
    await dragOverAt(rowOf("Tab 1"), 0.1)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(2),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("creates a split view with the dropped tab on the right when dropped on the middle of another temporary tab", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragStart(rowOf("Tab 2"))
    await dragOverAt(rowOf("Tab 1"), 0.5)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SplitTabs", tabId: TabId.make(2), withTabId: TabId.make(1) },
    ])
  })

  it("reports the lack of support instead of reordering when dropped on the split zone where split views aren't available", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([temporaryTab(tabView(1)), temporaryTab(tabView(2))], { canSplit: false }),
    )

    await fireEvent.dragStart(rowOf("Tab 2"))
    await dragOverAt(rowOf("Tab 1"), 0.5)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([])
    expect(screen.getByRole("status").textContent).toContain(
      "This browser doesn’t support split view (requires Chrome 155 or later)",
    )
  })

  it("still reorders above a row dropped on its top edge where split views aren't available", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([temporaryTab(tabView(1)), temporaryTab(tabView(2))], { canSplit: false }),
    )

    await fireEvent.dragStart(rowOf("Tab 2"))
    await dragOverAt(rowOf("Tab 1"), 0.1)
    await fireEvent.drop(rowOf("Tab 1"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(2),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("reorders a third tab around a split view row instead of adding it when dropped on the middle", async () => {
    const { connection } = await renderSidebar(
      viewWithEntries([redditAndGoogle, temporaryTab(tabView(3))]),
    )

    await fireEvent.dragStart(rowOf("Tab 3"))
    await dragOverAt(rowOf("Reddit"), 0.4)
    await fireEvent.drop(rowOf("Reddit"))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceTabInTemporary",
        tabId: TabId.make(3),
        spaceId: "work",
        placement: { _tag: "Above", tabId: TabId.make(1) },
      },
    ])
  })

  it("pins a split view row as a split view inside the pinned folder it is dropped on", async () => {
    const { connection } = await renderSidebar(viewWithEntries([redditAndGoogle]))
    const folderHeader = screen.getByRole("button", { name: "Docs" })

    await fireEvent.dragStart(rowOf("Reddit"))
    await dragOverAt(folderHeader, 0.5)
    await fireEvent.drop(folderHeader)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "PlaceSplitInPinned",
        splitViewId: SplitViewId.make(9),
        placement: { spaceId: "work", parentId: BookmarkId.make("folder"), index: 0 },
      },
    ])
  })

  it("ignores drops that didn't start as a drag in the sidebar, such as external links", async () => {
    const { connection } = await renderSidebar(viewWithTabs(tabView(1), tabView(2)))

    await fireEvent.dragOver(rowOf("Tab 2"))
    await fireEvent.drop(rowOf("Tab 2"))

    expect(connection.sentCommands).toStrictEqual([])
  })
})
