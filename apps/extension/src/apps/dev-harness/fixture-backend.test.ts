import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { themeOf } from "#modules/theme"
import { BookmarkId, TabId } from "#platform/browser"
import type { PinnedLiveFolderView, PinnedNodeView, SidebarView } from "#protocol"
import { respondInFixture } from "./fixture-backend"
import { fixtureView } from "./fixture-view"

const NOW = 0
const view = fixtureView(NOW)

const viewAfter = (command: Parameters<typeof respondInFixture>[0], from: SidebarView = view) => {
  const { view: next } = respondInFixture(command, from, NOW)
  if (next === undefined) throw new Error("no view returned")
  return next
}

const activeSpace = (next: SidebarView) => next.spaces.find((s) => s.id === next.activeSpaceId)

const temporaryTabIds = (next: SidebarView) =>
  (activeSpace(next)?.temporaryEntries ?? []).flatMap((entry) =>
    entry._tag === "TemporaryTab" ? [entry.tab.tabId] : entry.tabs.map((tab) => tab.tabId),
  )

const temporaryShape = (next: SidebarView) =>
  (activeSpace(next)?.temporaryEntries ?? []).map((entry) =>
    entry._tag === "TemporaryTab" ? entry.tab.tabId : entry.tabs.map((tab) => tab.tabId),
  )

const rootFolder = (next: SidebarView, bookmarkId: string) => {
  const pinned = next.spaces[0]?.pinned
  if (pinned?._tag !== "Available") throw new Error("the pinned tabs are unavailable")
  return pinned.nodes
    .flatMap((node) => (node._tag === "PinnedFolder" ? [node] : []))
    .find((folder) => folder.bookmarkId === bookmarkId)
}

const liveFoldersIn = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedLiveFolderView> =>
  nodes.flatMap((node) =>
    node._tag === "PinnedLiveFolder"
      ? [node]
      : node._tag === "PinnedFolder"
        ? liveFoldersIn(node.children)
        : [],
  )

const liveFolder = (next: SidebarView, bookmarkId: string) => {
  const found = next.spaces
    .flatMap((space) =>
      space.pinned._tag === "Available" ? liveFoldersIn(space.pinned.nodes) : [],
    )
    .find((folder) => folder.bookmarkId === bookmarkId)
  if (found === undefined) throw new Error(`no live folder ${bookmarkId}`)
  return found
}

describe("the fixture's naive responses", () => {
  it("switches Spaces", () => {
    const next = viewAfter({
      _tag: "SwitchSpace",
      windowId: view.windowId,
      spaceId: SpaceId.make("hobby"),
    })

    expect(next.activeSpaceId).toBe("hobby")
  })

  it("closing a temporary tab removes it from the list", () => {
    const next = viewAfter({ _tag: "CloseTab", tabId: TabId.make(32) })

    expect(temporaryTabIds(next)).not.toContain(32)
  })

  it("splitting two temporary tabs puts the dropped tab to the right of the row it was dropped on", () => {
    const next = viewAfter({ _tag: "SplitTabs", tabId: TabId.make(33), withTabId: TabId.make(32) })

    expect(temporaryShape(next)).toContainEqual([32, 33])
    expect(temporaryShape(next)).not.toContain(33)
  })

  it("separating a split view turns it back into two temporary tabs", () => {
    const split = activeSpace(view)?.temporaryEntries.find(
      (entry) => entry._tag === "TemporarySplit",
    )
    if (split?._tag !== "TemporarySplit") throw new Error("the fixture has no split view")

    const next = viewAfter({ _tag: "Unsplit", splitViewId: split.splitViewId })

    expect(temporaryShape(next)).toStrictEqual(
      expect.arrayContaining(split.tabs.map((tab) => tab.tabId)),
    )
  })

  it("closing one side of a split view leaves the other as a single temporary tab", () => {
    const split = activeSpace(view)?.temporaryEntries.find(
      (entry) => entry._tag === "TemporarySplit",
    )
    if (split?._tag !== "TemporarySplit") throw new Error("the fixture has no split view")

    const next = viewAfter({ _tag: "CloseTab", tabId: split.tabs[0].tabId })

    expect(temporaryShape(next)).toContain(split.tabs[1].tabId)
  })

  it("expands and collapses folders", () => {
    const next = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("design-docs"),
      isExpanded: false,
    })

    expect(rootFolder(next, "design-docs")?.isExpanded).toBe(false)
  })

  it("changes a folder's icon, and back to the default folder icon", () => {
    const withIcon = viewAfter({
      _tag: "SetFolderIcon",
      bookmarkId: BookmarkId.make("design-docs"),
      icon: "lightbulb",
    })
    const reverted = viewAfter(
      { _tag: "SetFolderIcon", bookmarkId: BookmarkId.make("design-docs"), icon: null },
      withIcon,
    )

    expect([
      rootFolder(withIcon, "design-docs")?.icon,
      rootFolder(reverted, "design-docs")?.icon,
    ]).toStrictEqual(["lightbulb", null])
  })

  it("moves a pin to the given position in another folder", () => {
    const next = viewAfter({
      _tag: "MovePinnedItem",
      bookmarkId: BookmarkId.make("calendar"),
      placement: {
        spaceId: SpaceId.make("work"),
        parentId: BookmarkId.make("design-docs"),
        index: 0,
      },
    })

    expect(rootFolder(next, "design-docs")?.children[0]?.bookmarkId).toBe("calendar")
  })

  it("moves a folder into another folder, contents and all", () => {
    const next = viewAfter({
      _tag: "MovePinnedItem",
      bookmarkId: BookmarkId.make("design-docs"),
      placement: {
        spaceId: SpaceId.make("work"),
        parentId: BookmarkId.make("empty-folder"),
        index: 0,
      },
    })

    const moved = rootFolder(next, "empty-folder")?.children[0]
    expect(moved?.bookmarkId).toBe("design-docs")
    expect(moved?._tag === "PinnedFolder" && moved.children.length).toBe(
      rootFolder(view, "design-docs")?.children.length,
    )
    expect(rootFolder(next, "design-docs")).toBeUndefined()
  })

  it("moves a live folder into a folder", () => {
    const next = viewAfter({
      _tag: "MovePinnedItem",
      bookmarkId: BookmarkId.make("live-inbox"),
      placement: {
        spaceId: SpaceId.make("work"),
        parentId: BookmarkId.make("empty-folder"),
        index: 0,
      },
    })

    expect(rootFolder(next, "empty-folder")?.children[0]?.bookmarkId).toBe("live-inbox")
  })

  it("activating a tab of another Space switches to that Space", () => {
    const next = viewAfter({ _tag: "ActivateTab", tabId: TabId.make(41) })

    expect(next.activeSpaceId).toBe("hobby")
  })

  it("returns the created folder's ID in the outcome", () => {
    const response = respondInFixture(
      { _tag: "CreateFolder", spaceId: SpaceId.make("work"), parentId: null },
      view,
      NOW,
    )

    expect(response.outcome._tag === "Succeeded" && response.outcome.createdBookmarkId).toBeTruthy()
  })

  it("changing a Space's theme changes that Space's theme only", () => {
    const theme = { ...themeOf([{ hue: 350, chroma: 0.55 }]), mode: "light" as const }

    const next = viewAfter({ _tag: "SetSpaceTheme", spaceId: SpaceId.make("hobby"), theme })

    expect(next.spaces.find((space) => space.id === "hobby")?.theme).toStrictEqual(theme)
    expect(next.spaces.find((space) => space.id === "work")?.theme).toStrictEqual(
      view.spaces.find((space) => space.id === "work")?.theme,
    )
  })

  it("a created Space has the given theme and becomes the shown Space", () => {
    const theme = themeOf([{ hue: 150, chroma: 0.75 }])

    const next = viewAfter({ _tag: "CreateSpace", windowId: view.windowId, theme })

    expect(activeSpace(next)?.theme).toStrictEqual(theme)
    expect(next.spaces).toHaveLength(view.spaces.length + 1)
  })

  it("deleting a folder removes it from the pinned tabs", () => {
    const next = viewAfter({ _tag: "DeleteFolder", bookmarkId: BookmarkId.make("design-docs") })

    expect(rootFolder(next, "design-docs")).toBeUndefined()
  })

  it("a created live folder appears with items from its source, and its ID is returned in the outcome", () => {
    const response = respondInFixture(
      {
        _tag: "CreateLiveFolder",
        spaceId: SpaceId.make("work"),
        parentId: null,
        source: { _tag: "GitHub", query: "assigned-issues" },
      },
      view,
      NOW,
    )
    if (response.outcome._tag !== "Succeeded" || response.outcome.createdBookmarkId === null) {
      throw new Error("no live folder ID returned")
    }
    if (response.view === undefined) throw new Error("no view returned")

    const created = liveFolder(response.view, response.outcome.createdBookmarkId)
    expect(created.status._tag).toBe("Ready")
    expect(created.items.length).toBeGreaterThan(0)
  })

  it("expands and collapses live folders too", () => {
    const next = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("live-inbox"),
      isExpanded: false,
    })

    expect(liveFolder(next, "live-inbox").isExpanded).toBe(false)
  })

  it("renames a live folder", () => {
    const next = viewAfter({
      _tag: "RenamePinnedItem",
      bookmarkId: BookmarkId.make("live-inbox"),
      title: "Mail",
    })

    expect(liveFolder(next, "live-inbox").title).toBe("Mail")
  })

  it("refreshing a live folder that failed makes it ready", () => {
    const next = viewAfter({
      _tag: "RefreshLiveFolder",
      bookmarkId: BookmarkId.make("live-my-prs"),
    })

    expect(liveFolder(next, "live-my-prs").status).toStrictEqual({
      _tag: "Ready",
      refreshedAt: NOW,
    })
  })

  it("marking all as read leaves no unread items", () => {
    const next = viewAfter({
      _tag: "MarkLiveFolderSeen",
      bookmarkId: BookmarkId.make("live-inbox"),
    })

    expect(liveFolder(next, "live-inbox").items.some((item) => item.isUnseen)).toBe(false)
  })

  it("opening a live folder item opens it as a temporary tab and marks it read", () => {
    const [first] = liveFolder(view, "live-inbox").items
    if (first === undefined) throw new Error("the fixture's inbox is empty")

    const next = viewAfter({
      _tag: "OpenLiveItem",
      windowId: view.windowId,
      bookmarkId: BookmarkId.make("live-inbox"),
      itemId: first.id,
    })

    expect(activeSpace(next)?.temporaryEntries[0]).toMatchObject({
      tab: { url: first.url, isActive: true },
    })
    expect(liveFolder(next, "live-inbox").items[0]?.isUnseen).toBe(false)
  })

  it("changing a live folder's sort reorders its items by it", () => {
    const next = viewAfter({
      _tag: "SetLiveFolderSort",
      bookmarkId: BookmarkId.make("live-inbox"),
      sort: "oldest",
    })

    const folder = liveFolder(next, "live-inbox")
    const updatedAts = folder.items.map((item) => item.updatedAt)
    expect(folder.sort).toBe("oldest")
    expect(updatedAts).toStrictEqual([...updatedAts].sort((a, b) => a - b))
  })

  it("sorted by repository, groups each repository's items together, newest first", () => {
    const next = viewAfter({
      _tag: "SetLiveFolderSort",
      bookmarkId: BookmarkId.make("live-reviews"),
      sort: "source",
    })

    expect(liveFolder(next, "live-reviews").items.map((item) => item.subtitle)).toStrictEqual([
      "katip/katip #214",
      "katip/katip #209",
      "katip/website #77",
    ])
  })

  it("opening a URL opens it as a temporary tab of the shown Space", () => {
    const next = viewAfter({
      _tag: "OpenUrl",
      windowId: view.windowId,
      url: "https://github.com/login",
    })

    expect(activeSpace(next)?.temporaryEntries[0]).toMatchObject({
      tab: { url: "https://github.com/login", isActive: true },
    })
  })

  it("a collapsed folder shows an open split pin inside it as one item with both tabs", () => {
    const peeked = rootFolder(view, "comparisons")?.peekedItems ?? []

    expect(peeked.map((node) => [node._tag, node.bookmarkId])).toStrictEqual([
      ["PinnedSplit", "compare-spec"],
      ["PinnedSplit", "compare-design"],
    ])
  })

  it("an expanded folder shows nothing beneath its row, and collapsing it again shows the items again", () => {
    const expanded = viewAfter({
      _tag: "SetFolderExpanded",
      bookmarkId: BookmarkId.make("comparisons"),
      isExpanded: true,
    })
    const collapsed = viewAfter(
      { _tag: "SetFolderExpanded", bookmarkId: BookmarkId.make("comparisons"), isExpanded: false },
      expanded,
    )

    expect([
      rootFolder(expanded, "comparisons")?.peekedItems.length,
      rootFolder(collapsed, "comparisons")?.peekedItems.length,
    ]).toStrictEqual([0, 2])
  })

  it("a command it doesn't reproduce gets a notice saying so", () => {
    const response = respondInFixture({ _tag: "ArchiveTab", tabId: TabId.make(31) }, view, NOW)

    expect(response.notice).toContain("ArchiveTab")
  })
})
