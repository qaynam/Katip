import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { BookmarkId } from "#platform/browser"
import type { PinnedNodeView } from "#protocol"
import { renderSidebar } from "../testing/render-sidebar"
import {
  liveItem,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  sidebarView,
  spaceView,
} from "../testing/view-builders"

const HOUR_MS = 60 * 60_000

const viewWithPins = (...nodes: ReadonlyArray<PinnedNodeView>) =>
  sidebarView({ spaces: [spaceView("work", { pinnedNodes: nodes })] })

const closedDocs = () =>
  pinnedFolder("docs", {
    title: "Docs",
    isExpanded: false,
    children: [
      pinnedItem("api", { title: "API reference" }),
      pinnedItem("flow", { title: "Screen flow" }),
      pinnedItem("minutes", { title: "Weekly sync notes" }),
    ],
  })

const openSearch = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "Search in Folder" }))
  return screen.getByRole("combobox", { name: "Search in Folder" })
}

const shownOptions = () =>
  within(screen.getByRole("listbox"))
    .queryAllByRole("option")
    .map((option) => option.textContent)

const optionsTitled = (...titles: ReadonlyArray<string>) =>
  titles.map((title) => expect.stringContaining(title))

describe("Searching inside a collapsed folder", () => {
  it("opens a search popover listing the folder's contents when the magnifier is clicked", async () => {
    await renderSidebar(viewWithPins(closedDocs()))

    await openSearch()

    expect(shownOptions()).toStrictEqual(
      optionsTitled("API reference", "Screen flow", "Weekly sync notes"),
    )
  })

  it("narrows the list to entries containing the typed words", async () => {
    await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "reference" } })

    expect(shownOptions()).toStrictEqual(optionsTitled("API reference"))
  })

  it("opens the first entry and closes the popover on Enter", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "notes" } })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("minutes") },
    ])
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("moves the selection with ↓ and ↑ and opens the selected entry on Enter", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowDown" })
    await fireEvent.keyDown(input, { key: "ArrowUp" })
    await fireEvent.keyDown(input, { key: "Enter" })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId: 1, bookmarkId: BookmarkId.make("flow") },
    ])
  })

  it("says so when nothing matches", async () => {
    await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.input(input, { target: { value: "nonexistent" } })

    expect(screen.getByText("No matches")).toBeTruthy()
  })

  it("closes the popover without opening anything on Escape", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedDocs()))
    const input = await openSearch()

    await fireEvent.keyDown(input, { key: "Escape" })

    expect(screen.queryByRole("combobox")).toBeNull()
    expect(connection.sentCommands).toStrictEqual([])
  })

  it("shows no magnifier on an expanded folder", async () => {
    await renderSidebar(viewWithPins({ ...closedDocs(), isExpanded: true }))

    expect(screen.queryByRole("button", { name: "Search in Folder" })).toBeNull()
  })
})

describe("Searching inside a collapsed live folder", () => {
  const closedInbox = () =>
    pinnedLiveFolder("inbox", {
      title: "Inbox",
      isExpanded: false,
      items: [
        liveItem("quote", {
          title: "Re: Quote",
          subtitle: "Jane Doe",
          updatedAt: Date.now() - 2 * HOUR_MS,
        }),
      ],
    })

  it("shows the time since the source updated each item, along with its subtitle", async () => {
    await renderSidebar(viewWithPins(closedInbox()))

    await openSearch()

    expect(screen.getByRole("option", { name: /Re: Quote/ }).textContent).toContain(
      "2 hours ago · Jane Doe",
    )
  })

  it("opens the item when chosen", async () => {
    const { connection } = await renderSidebar(viewWithPins(closedInbox()))
    await openSearch()

    await fireEvent.click(screen.getByRole("option", { name: /Re: Quote/ }))

    expect(connection.sentCommands).toStrictEqual([
      {
        _tag: "OpenLiveItem",
        windowId: 1,
        bookmarkId: BookmarkId.make("inbox"),
        itemId: "quote",
      },
    ])
  })
})
