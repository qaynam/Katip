import { fireEvent, screen } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView, TabView } from "#protocol"
import { commandsOf, dragOverAt, renderSidebar } from "../testing/render-sidebar"
import {
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
} from "../testing/view-builders"

const viewWith = (
  nodes: ReadonlyArray<PinnedNodeView>,
  temporaryTabs: ReadonlyArray<TabView> = [],
) => sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes, temporaryTabs })] })

const folderHeader = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) })

const dragOnto = async (source: HTMLElement, target: HTMLElement, verticalRatio: number) => {
  await fireEvent.dragStart(source)
  await dragOverAt(target, verticalRatio)
  await fireEvent.drop(target)
}

const docs = (overrides: Parameters<typeof pinnedFolder>[1] = {}) =>
  pinnedFolder("docs", { title: "Docs", isExpanded: false, ...overrides })

const projects = pinnedFolder("projects", {
  title: "Projects",
  isExpanded: false,
  children: [pinnedItem("plan"), pinnedItem("budget")],
})

describe("Dragging folders", () => {
  it("moves a folder to the end of another folder when dropped on the middle of its header", async () => {
    const { connection } = await renderSidebar(viewWith([docs(), projects]))

    await dragOnto(folderHeader("Docs"), folderHeader("Projects"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("reorders a folder before another folder when dropped on the top edge of its header", async () => {
    const { connection } = await renderSidebar(viewWith([projects, docs()]))

    await dragOnto(folderHeader("Docs"), folderHeader("Projects"), 0.1)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: null, index: 0 },
      },
    ])
  })

  it("rejects dropping a folder into a folder inside itself", async () => {
    const minutes = pinnedFolder("minutes", { title: "Meeting notes", isExpanded: false })
    const { connection } = await renderSidebar(
      viewWith([docs({ isExpanded: true, children: [minutes] })]),
    )

    await dragOnto(folderHeader("Docs"), folderHeader("Meeting notes"), 0.5)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("does nothing when a folder is dropped on the middle of its own header", async () => {
    const { connection } = await renderSidebar(viewWith([docs()]))

    await dragOnto(folderHeader("Docs"), folderHeader("Docs"), 0.5)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("places a folder before or after a live folder rather than inside it when dropped on its header", async () => {
    const inbox = pinnedLiveFolder("inbox", { title: "Inbox" })
    const { connection } = await renderSidebar(viewWith([docs(), inbox]))

    await dragOnto(folderHeader("Docs"), folderHeader("Inbox"), 0.6)

    expect(commandsOf(connection.sentCommands, "MovePinnedItem")).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("docs"),
        placement: { spaceId: "work", parentId: null, index: 1 },
      },
    ])
  })

  it("moves a live folder into another folder by dragging", async () => {
    const inbox = pinnedLiveFolder("inbox", { title: "Inbox" })
    const { connection } = await renderSidebar(viewWith([inbox, projects]))

    await dragOnto(folderHeader("Inbox"), folderHeader("Projects"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("inbox"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("moves a pinned split view into a folder by dragging", async () => {
    const pair = pinnedSplit("pair", [
      pinnedItem("left", { title: "Design doc" }),
      pinnedItem("right", { title: "Preview" }),
    ])
    const { connection } = await renderSidebar(viewWith([pair, projects]))
    const pairRow = screen.getByRole("button", { name: "Design doc" }).closest("li") as HTMLElement

    await dragOnto(pairRow, folderHeader("Projects"), 0.5)

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "MovePinnedItem",
        bookmarkId: BookmarkId.make("pair"),
        placement: { spaceId: "work", parentId: BookmarkId.make("projects"), index: 2 },
      },
    ])
  })

  it("does nothing when a folder is dropped on a temporary tab row", async () => {
    const { connection } = await renderSidebar(viewWith([docs()], [tabView(1)]))
    const tabRow = screen.getByRole("button", { name: "Tab 1" }).closest("li") as HTMLElement

    await dragOnto(folderHeader("Docs"), tabRow, 0.9)

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("shows the reason when the background refuses the move", async () => {
    await renderSidebar(viewWith([docs(), projects]), {
      respond: () => ({
        outcome: { _tag: "Failed", reason: "Folders can only be nested two levels deep" },
      }),
    })

    await dragOnto(folderHeader("Docs"), folderHeader("Projects"), 0.5)
    await tick()

    expect(screen.getByRole("status").textContent).toContain(
      "Folders can only be nested two levels deep",
    )
  })
})

describe("While dragging a folder", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("expands another collapsed folder after hovering over its header for 250ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(viewWith([docs(), projects]))

    await fireEvent.dragStart(folderHeader("Docs"))
    await dragOverAt(folderHeader("Projects"), 0.5)
    vi.advanceTimersByTime(250)

    expect(commandsOf(connection.sentCommands, "SetFolderExpanded")).toStrictEqual([
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("projects"), isExpanded: true },
    ])
  })

  it("doesn't expand itself when hovering over its own header", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { connection } = await renderSidebar(viewWith([docs()]))

    await fireEvent.dragStart(folderHeader("Docs"))
    await dragOverAt(folderHeader("Docs"), 0.5)
    vi.advanceTimersByTime(1_000)

    expect(commandsOf(connection.sentCommands, "SetFolderExpanded")).toStrictEqual([])
  })
})
