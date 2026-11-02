import { describe, expect, it } from "vitest"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import {
  liveItem,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  tabView,
} from "../testing/view-builders"
import { filterFolderSearch, folderSearchEntries } from "./folder-search"

const windowId = WindowId.make(1)

describe("folderSearchEntries", () => {
  it("lists the contents of nested folders and live folders in their order within the folder", () => {
    const folder = pinnedFolder("docs", {
      children: [
        pinnedItem("spec", { title: "Spec" }),
        pinnedFolder("minutes", { children: [pinnedItem("1028", { title: "10/28 weekly sync" })] }),
        pinnedLiveFolder("inbox", { items: [liveItem("mail", { title: "Re: Quote" })] }),
      ],
    })

    const titles = folderSearchEntries(folder, windowId).map((entry) => entry.title)

    expect(titles).toStrictEqual(["Spec", "10/28 weekly sync", "Re: Quote"])
  })

  it("opens a closed pin when chosen, and switches to the tab of an open pin", () => {
    const folder = pinnedFolder("docs", {
      children: [pinnedItem("closed"), pinnedItem("open", { openTab: openPinnedTab(tabView(7)) })],
    })

    const commands = folderSearchEntries(folder, windowId).map((entry) => entry.command)

    expect(commands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("closed") },
      { _tag: "ActivateTab", tabId: TabId.make(7) },
    ])
  })

  it("opens both halves of a closed pinned split view whichever half is chosen", () => {
    const folder = pinnedFolder("docs", {
      children: [pinnedSplit("pair", [pinnedItem("left"), pinnedItem("right")])],
    })

    const commands = folderSearchEntries(folder, windowId).map((entry) => entry.command)

    expect(commands).toStrictEqual([
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("pair") },
      { _tag: "OpenPinnedItem", windowId, bookmarkId: BookmarkId.make("pair") },
    ])
  })

  it("gives live items the source's update time and opens the item when chosen", () => {
    const folder = pinnedLiveFolder("inbox", {
      items: [liveItem("mail", { updatedAt: 1_000, isUnseen: true })],
    })

    expect(folderSearchEntries(folder, windowId)).toMatchObject([
      {
        lastActivityAt: 1_000,
        isUnseen: true,
        command: {
          _tag: "OpenLiveItem",
          windowId,
          bookmarkId: BookmarkId.make("inbox"),
          itemId: "mail",
        },
      },
    ])
  })

  it("gives pins no time", () => {
    const [entry] = folderSearchEntries(
      pinnedFolder("docs", { children: [pinnedItem("spec")] }),
      windowId,
    )

    expect(entry?.lastActivityAt).toBeNull()
  })

  it("has no entries for an empty folder", () => {
    expect(folderSearchEntries(pinnedFolder("empty"), windowId)).toStrictEqual([])
  })
})

describe("filterFolderSearch", () => {
  const entries = folderSearchEntries(
    pinnedFolder("docs", {
      children: [
        pinnedItem("api", { title: "API reference", url: "https://docs.example.com/api" }),
        pinnedItem("flow", { title: "Screen flow", url: "https://design.example.com/flow" }),
        pinnedLiveFolder("inbox", {
          items: [liveItem("mail", { title: "Re: Quote", subtitle: "Jane Doe" })],
        }),
      ],
    }),
    windowId,
  )
  const titlesFor = (query: string) =>
    filterFolderSearch(entries, query).map((entry) => entry.title)

  it("keeps everything in the original order for an empty query", () => {
    expect(titlesFor("  ")).toStrictEqual(["API reference", "Screen flow", "Re: Quote"])
  })

  it("keeps only entries whose title, subtitle, or URL contains the query", () => {
    expect(titlesFor("reference")).toStrictEqual(["API reference"])
    expect(titlesFor("Jane")).toStrictEqual(["Re: Quote"])
    expect(titlesFor("design.example")).toStrictEqual(["Screen flow"])
  })

  it("keeps only entries containing every whitespace-separated term", () => {
    expect(titlesFor("api reference")).toStrictEqual(["API reference"])
    expect(titlesFor("api flow")).toStrictEqual([])
  })

  it("ignores case and full-width/half-width differences", () => {
    expect(titlesFor("ＡＰＩ")).toStrictEqual(["API reference"])
  })
})
