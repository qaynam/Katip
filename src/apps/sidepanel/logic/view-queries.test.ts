import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { ArchiveEntryId } from "#modules/archive"
import { SpaceId } from "#modules/space"
import { SplitViewId } from "#platform/browser"
import {
  archiveEntry,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  tabView,
} from "../testing/view-builders"
import {
  archiveEntriesFor,
  hostOf,
  openSplitViewOf,
  pinnedItemDisplay,
  selfAndDescendantFolderIds,
} from "./view-queries"

describe("archiveEntriesFor", () => {
  const work = SpaceId.make("work")
  const hobby = SpaceId.make("hobby")
  const entries = [
    archiveEntry("old", { spaceId: work, archivedAt: 100 }),
    archiveEntry("hobby", { spaceId: hobby, archivedAt: 300 }),
    archiveEntry("new", { spaceId: work, archivedAt: 200 }),
  ]

  it("lists only the current Space's archive, newest first", () => {
    const ids = archiveEntriesFor(entries, "currentSpace", work).map((entry) => entry.id)

    expect(ids).toStrictEqual([ArchiveEntryId.make("new"), ArchiveEntryId.make("old")])
  })

  it("mixes in other Spaces' archives, newest first, when all Spaces are chosen", () => {
    const ids = archiveEntriesFor(entries, "allSpaces", work).map((entry) => entry.id)

    expect(ids).toStrictEqual(["hobby", "new", "old"].map((id) => ArchiveEntryId.make(id)))
  })
})

describe("pinnedItemDisplay", () => {
  it("shows a closed pin by the pin's name", () => {
    const item = pinnedItem("a", { title: "Design doc", openTab: null })

    expect(pinnedItemDisplay(item)).toStrictEqual({ _tag: "Closed", title: "Design doc" })
  })

  it("shows a closed pin without a name by the URL's host name", () => {
    const item = pinnedItem("a", { title: "", url: "https://example.com/docs", openTab: null })

    expect(pinnedItemDisplay(item).title).toBe("example.com")
  })

  it("shows the pin's name rather than the page title while at the pinned URL", () => {
    const tab = tabView(1, { title: "Untitled document - Docs" })
    const item = pinnedItem("a", { title: "Meeting notes", openTab: openPinnedTab(tab) })

    expect(pinnedItemDisplay(item)).toStrictEqual({ _tag: "AtPinnedUrl", title: "Meeting notes" })
  })

  it("keeps showing the pin's name after navigating away and adds the current page title", () => {
    const tab = tabView(1, { title: "Search results" })
    const item = pinnedItem("a", {
      title: "Meeting notes",
      openTab: openPinnedTab(tab, { hasNavigatedAway: true }),
    })

    expect(pinnedItemDisplay(item)).toStrictEqual({
      _tag: "NavigatedAway",
      title: "Meeting notes",
      pageTitle: "Search results",
    })
  })
})

describe("hostOf", () => {
  it("has no host name for a string that isn't a URL", () => {
    expect(Option.isNone(hostOf("not a url"))).toBe(true)
  })

  it("has no host name for a URL without a host", () => {
    expect(Option.isNone(hostOf("about:blank"))).toBe(true)
  })
})

describe("openSplitViewOf", () => {
  const openItem = (id: string, tabId: number, splitViewId: number | null) =>
    pinnedItem(id, {
      openTab: openPinnedTab(
        tabView(tabId, {
          splitViewId: splitViewId === null ? null : SplitViewId.make(splitViewId),
        }),
      ),
    })

  it("returns the split view when both pins are open in the same split view", () => {
    const split = pinnedSplit("split", [openItem("a", 1, 9), openItem("b", 2, 9)])

    expect(openSplitViewOf(split)).toBe(SplitViewId.make(9))
  })

  it("isn't open as a split view when either pin is closed", () => {
    const split = pinnedSplit("split", [openItem("a", 1, 9), pinnedItem("b")])

    expect(openSplitViewOf(split)).toBeNull()
  })

  it("isn't open as a split view when both are open but not side by side", () => {
    const apart = pinnedSplit("split", [openItem("a", 1, null), openItem("b", 2, null)])
    const elsewhere = pinnedSplit("split", [openItem("a", 1, 9), openItem("b", 2, 10)])

    expect(openSplitViewOf(apart)).toBeNull()
    expect(openSplitViewOf(elsewhere)).toBeNull()
  })
})

describe("selfAndDescendantFolderIds", () => {
  it("includes the folder itself and every nested folder and live folder", () => {
    const folder = pinnedFolder("docs", {
      children: [
        pinnedItem("spec"),
        pinnedFolder("minutes", { children: [pinnedLiveFolder("inbox")] }),
      ],
    })

    expect(selfAndDescendantFolderIds(folder)).toStrictEqual(["docs", "minutes", "inbox"])
  })

  it("is just itself for a live folder", () => {
    expect(selfAndDescendantFolderIds(pinnedLiveFolder("inbox"))).toStrictEqual(["inbox"])
  })
})
