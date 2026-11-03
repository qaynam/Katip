import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { LiveFolderRecord, LiveItem, LiveSource } from "#modules/live-folders"
import type { PinnedTree } from "#modules/pinned"
import { makeTranslator } from "#modules/i18n"
import { defaultSettings } from "#modules/settings"
import { neutralTheme } from "#modules/theme"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import {
  assignTab,
  bindPinned,
  emptyWorkspace,
  setTitleOverride,
  switchSpace,
  type Workspace,
} from "#modules/workspace"
import { BookmarkId, SplitViewId, TabId, WindowId, type BrowserTab } from "#platform/browser"
import type {
  PinnedFolderView,
  PinnedItemView,
  PinnedLiveFolderView,
  SidebarView,
  SpaceView,
} from "#protocol"
import { projectSidebarView, type SidebarSources } from "./sidebar-view"

const WINDOW = WindowId.make(1)
const tabId = (value: number) => TabId.make(value)
const spaceId = (value: string) => SpaceId.make(value)
const bookmarkId = (value: string) => BookmarkId.make(value)

const space = (id: string): Space => ({
  id: spaceId(id),
  name: SpaceName.make(id),
  theme: neutralTheme,
})

const browserTab = (id: number, overrides: Partial<BrowserTab> = {}): BrowserTab => ({
  id: tabId(id),
  windowId: WINDOW,
  index: id,
  url: Option.some(`https://example.com/${id}`),
  pendingUrl: Option.none(),
  title: Option.some(`Tab ${id}`),
  favIconUrl: Option.none(),
  status: Option.some("complete"),
  active: false,
  pinned: false,
  audible: false,
  muted: false,
  discarded: false,
  incognito: false,
  openerTabId: Option.none(),
  groupId: Option.none(),
  lastAccessed: Option.none(),
  splitViewId: Option.none(),
  ...overrides,
})

const bookmark = (id: string, url: string, title = id): PinnedTree[number] => ({
  _tag: "PinnedBookmark",
  id: bookmarkId(id),
  title,
  url,
})

const folder = (id: string, children: PinnedTree): PinnedTree[number] => ({
  _tag: "PinnedFolder",
  id: bookmarkId(id),
  title: id,
  children,
})

const sources = (overrides: Partial<SidebarSources> = {}): SidebarSources => ({
  windowId: WINDOW,
  spaces: [space("home"), space("work")],
  workspace: switchSpace(emptyWorkspace, WINDOW, spaceId("home")),
  windowTabs: [],
  pinnedTrees: new Map([
    [spaceId("home"), []],
    [spaceId("work"), []],
  ]),
  folderExpansion: {},
  folderIcons: new Map(),
  liveFolders: { records: new Map(), refreshing: new Set(), sorts: new Map() },
  translator: makeTranslator("en"),
  preferences: {
    newTabsOnTop: false,
    showAllOpenTabsInCollapsedFolders: false,
    syncTabGroups: false,
  },
  autoArchive: defaultSettings.autoArchive,
  archive: [],
  canSplit: true,
  spotlightShortcut: null,
  ...overrides,
})

const inHome = (workspace: Workspace, ...ids: ReadonlyArray<number>) =>
  ids.reduce((acc, id) => assignTab(acc, tabId(id), spaceId("home"), 0), workspace)

const project = (overrides: Partial<SidebarSources> = {}): SidebarView =>
  Option.getOrThrow(projectSidebarView(sources(overrides)))

const temporaryTabsOf = (space: SpaceView) =>
  space.temporaryEntries.flatMap((entry) =>
    entry._tag === "TemporaryTab" ? [entry.tab] : [...entry.tabs],
  )

const temporaryTabIds = (space: SpaceView) => temporaryTabsOf(space).map((tab) => tab.tabId)

const homeOf = (view: SidebarView): SpaceView =>
  Option.getOrThrow(Option.fromNullishOr(view.spaces.find((s) => s.id === spaceId("home"))))

const pinnedNodesOf = (view: SidebarView) => {
  const pinned = homeOf(view).pinned
  return pinned._tag === "Available" ? pinned.nodes : []
}

const homeWithPin = (tree: PinnedTree): SidebarSources["pinnedTrees"] =>
  new Map([
    [spaceId("home"), tree],
    [spaceId("work"), []],
  ])

describe("active Space", () => {
  it("shows the active Space recorded for the window", () => {
    const view = project({ workspace: switchSpace(emptyWorkspace, WINDOW, spaceId("work")) })

    expect(view.activeSpaceId).toBe("work")
  })

  it("shows the first Space when none is recorded", () => {
    const view = project({ workspace: emptyWorkspace })

    expect(view.activeSpaceId).toBe("home")
  })

  it("builds no view when there are no Spaces", () => {
    expect(projectSidebarView(sources({ spaces: [] }))).toStrictEqual(Option.none())
  })
})

describe("temporary tabs", () => {
  const workspace = inHome(switchSpace(emptyWorkspace, WINDOW, spaceId("home")), 1, 2, 3)
  const windowTabs = [browserTab(3), browserTab(1), browserTab(2)]

  it("are shown in Chrome's tab order", () => {
    const view = project({ workspace, windowTabs })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([1, 2, 3])
  })

  it("are shown in reverse with newest tabs on top", () => {
    const view = project({
      workspace,
      windowTabs,
      preferences: { ...sources().preferences, newTabsOnTop: true },
    })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([3, 2, 1])
  })

  it("a renamed tab is shown under its new name", () => {
    const renamed = setTitleOverride(workspace, tabId(1), Option.some("Inbox"))

    const view = project({ workspace: renamed, windowTabs })

    expect(temporaryTabsOf(homeOf(view))[0]?.title).toBe("Inbox")
  })

  it("a tab without a title yet is named after its URL", () => {
    const view = project({
      workspace,
      windowTabs: [browserTab(1, { title: Option.none() })],
    })

    expect(temporaryTabsOf(homeOf(view))[0]?.title).toBe("https://example.com/1")
  })

  it("a tab of another Space is listed under that Space", () => {
    const mixed = assignTab(workspace, tabId(4), spaceId("work"), 0)

    const view = project({ workspace: mixed, windowTabs: [...windowTabs, browserTab(4)] })

    expect(view.spaces.map((s) => [s.id, temporaryTabIds(s)])).toStrictEqual([
      ["home", [1, 2, 3]],
      ["work", [4]],
    ])
  })
})

describe("Favorites", () => {
  it("lists the tabs pinned in Chrome in index order, and shows them in no Space", () => {
    const view = project({
      workspace: inHome(emptyWorkspace, 3),
      windowTabs: [
        browserTab(2, { pinned: true, index: 1 }),
        browserTab(1, { pinned: true, index: 0, active: true }),
        browserTab(3, { index: 2 }),
      ],
    })

    expect({
      favorites: view.favorites.map((f) => [f.tabId, f.isActive]),
      home: temporaryTabIds(homeOf(view)),
    }).toStrictEqual({
      favorites: [
        [1, true],
        [2, false],
      ],
      home: [3],
    })
  })
})

describe("pins", () => {
  const pinnedUrl = "https://mail.example/inbox"
  const boundWorkspace = bindPinned(inHome(emptyWorkspace, 1), tabId(1), {
    bookmarkId: bookmarkId("mail"),
    pinnedUrl,
  })

  it("a pin that isn't open is shown without a tab", () => {
    const view = project({ pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "Mail")]) })

    expect(pinnedNodesOf(view)).toStrictEqual([
      { _tag: "PinnedItem", bookmarkId: "mail", title: "Mail", url: pinnedUrl, openTab: null },
    ])
  })

  it("a tab bound to a pin is shown as the pin's open tab, not among the temporary tabs", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1, { url: Option.some(pinnedUrl) })],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "Mail")]),
    })

    expect({
      temporary: temporaryTabsOf(homeOf(view)).length,
      openTab: (pinnedNodesOf(view)[0] as PinnedItemView).openTab?.tab.tabId,
    }).toStrictEqual({ temporary: 0, openTab: 1 })
  })

  it("a pin that hasn't navigated away is shown under the bookmark's name", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1, { url: Option.some(`${pinnedUrl}?page=2`) })],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "Mail")]),
    })
    const item = pinnedNodesOf(view)[0] as PinnedItemView

    expect([item.title, item.openTab?.hasNavigatedAway]).toStrictEqual(["Mail", false])
  })

  it("a pin that navigated to another page keeps the pin's name, and shows it navigated away and the current page's title", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [
        browserTab(1, {
          url: Option.some("https://mail.example/settings"),
          title: Option.some("Settings"),
        }),
      ],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "Mail")]),
    })
    const item = pinnedNodesOf(view)[0] as PinnedItemView

    expect([item.title, item.openTab?.hasNavigatedAway, item.openTab?.tab.title]).toStrictEqual([
      "Mail",
      true,
      "Settings",
    ])
  })

  it("a tab whose bound bookmark is gone is shown as a temporary tab", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1)],
      pinnedTrees: homeWithPin([]),
    })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([1])
  })

  it("a Space whose pinned tree couldn't be read is shown as unavailable", () => {
    const view = project({ pinnedTrees: new Map([[spaceId("work"), []]]) })

    expect(homeOf(view).pinned._tag).toBe("Unavailable")
  })
})

describe("a pinned split peeking out of a collapsed folder", () => {
  const leftUrl = "https://spec.example/draft"
  const rightUrl = "https://spec.example/review"
  const splitPin: PinnedTree[number] = {
    _tag: "PinnedSplit",
    id: bookmarkId("pair"),
    title: "Draft | Review",
    items: [
      { _tag: "PinnedBookmark", id: bookmarkId("left"), title: "Draft", url: leftUrl },
      { _tag: "PinnedBookmark", id: bookmarkId("right"), title: "Review", url: rightUrl },
    ],
  }
  const collapsedFolderWith = (...children: PinnedTree) => homeWithPin([folder("f", children)])

  /** Opens only the right side of the pinned split in a tab. */
  const rightSideOpen = (tab: Partial<BrowserTab> = {}) => ({
    workspace: bindPinned(inHome(emptyWorkspace, 7), tabId(7), {
      bookmarkId: bookmarkId("right"),
      pinnedUrl: rightUrl,
    }),
    windowTabs: [browserTab(7, { url: Option.some(rightUrl), ...tab })],
  })
  const showingAllOpenTabs = (showAll: boolean) => ({
    preferences: { ...sources().preferences, showAllOpenTabsInCollapsedFolders: showAll },
  })

  const peekedOf = (view: SidebarView) => {
    const node = pinnedNodesOf(view)[0]
    return node?._tag === "PinnedFolder"
      ? node.peekedItems.map((peeked) =>
          peeked._tag === "PinnedSplit"
            ? peeked.items.map((item) => item.bookmarkId)
            : peeked.bookmarkId,
        )
      : []
  }

  it("with the setting on, peeks out as one row with both sides, even when only one side is open", () => {
    const view = project({
      ...rightSideOpen(),
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })

  it("doesn't peek out when neither side is open", () => {
    const view = project({
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([])
  })

  it("with the setting off, still peeks out as one row when it holds the active tab", () => {
    const view = project({
      ...rightSideOpen({ active: true }),
      ...showingAllOpenTabs(false),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })

  it("with the setting off, doesn't peek out when open but not active", () => {
    const view = project({
      ...rightSideOpen({ active: false }),
      ...showingAllOpenTabs(false),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([])
  })

  it("peeks out as one row from a nested folder too", () => {
    const view = project({
      ...rightSideOpen(),
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(folder("inner", [splitPin])),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })
})

describe("folders", () => {
  const workspace = bindPinned(
    bindPinned(inHome(emptyWorkspace, 1, 2), tabId(1), {
      bookmarkId: bookmarkId("a"),
      pinnedUrl: "https://a.example/",
    }),
    tabId(2),
    { bookmarkId: bookmarkId("b"), pinnedUrl: "https://b.example/" },
  )
  const windowTabs = [
    browserTab(1, { url: Option.some("https://a.example/"), active: true }),
    browserTab(2, { url: Option.some("https://b.example/") }),
  ]
  const tree = [
    folder("f", [
      bookmark("a", "https://a.example/"),
      bookmark("b", "https://b.example/"),
      bookmark("c", "https://c.example/"),
    ]),
  ]
  const folderOf = (view: SidebarView) => pinnedNodesOf(view)[0] as PinnedFolderView
  const peekedIds = (view: SidebarView) => folderOf(view).peekedItems.map((i) => i.bookmarkId)

  it("a collapsed folder peeks out only the pin open in the active tab under its heading", () => {
    const view = project({ workspace, windowTabs, pinnedTrees: homeWithPin(tree) })

    expect(peekedIds(view)).toStrictEqual(["a"])
  })

  it("with the show-all setting, a collapsed folder peeks out every open pin in it", () => {
    const view = project({
      workspace,
      windowTabs,
      pinnedTrees: homeWithPin(tree),
      preferences: { ...sources().preferences, showAllOpenTabsInCollapsedFolders: true },
    })

    expect(peekedIds(view)).toStrictEqual(["a", "b"])
  })

  it("an expanded folder peeks out nothing", () => {
    const view = project({
      workspace,
      windowTabs,
      pinnedTrees: homeWithPin(tree),
      folderExpansion: { [bookmarkId("f")]: true },
    })

    expect([folderOf(view).isExpanded, peekedIds(view)]).toStrictEqual([true, []])
  })

  it("with tab group sync on, no folder can be created inside a top-level folder of a Space", () => {
    const view = project({
      pinnedTrees: homeWithPin(tree),
      preferences: { ...sources().preferences, syncTabGroups: true },
    })

    expect(folderOf(view).canCreateSubfolder).toBe(false)
  })

  it("a folder with a chosen icon carries that icon", () => {
    const view = project({
      pinnedTrees: homeWithPin(tree),
      folderIcons: new Map([[bookmarkId("f"), "star"]]),
    })

    expect(folderOf(view).icon).toBe("star")
  })

  it("a folder without a chosen icon has no icon", () => {
    const view = project({ pinnedTrees: homeWithPin(tree) })

    expect(folderOf(view).icon).toBeNull()
  })
})

describe("split view", () => {
  const split = SplitViewId.make(7)
  const workspace = inHome(switchSpace(emptyWorkspace, WINDOW, spaceId("home")), 1, 2, 3)
  const windowTabs = [
    browserTab(1),
    browserTab(2, { splitViewId: Option.some(split) }),
    browserTab(3, { splitViewId: Option.some(split) }),
  ]
  const shape = (view: SidebarView) =>
    homeOf(view).temporaryEntries.map((entry) =>
      entry._tag === "TemporaryTab" ? entry.tab.tabId : entry.tabs.map((tab) => tab.tabId),
    )

  it("two temporary tabs of the same split view merge into one row, left then right", () => {
    const view = project({ workspace, windowTabs })

    expect(shape(view)).toStrictEqual([1, [2, 3]])
  })

  it("with newest tabs on top, the sides of a split still don't swap", () => {
    const view = project({
      workspace,
      windowTabs,
      preferences: { ...sources().preferences, newTabsOnTop: true },
    })

    expect(shape(view)).toStrictEqual([[2, 3], 1])
  })

  it("when one side of a split is bound to a pin, the other is shown as a temporary tab of its own", () => {
    const pinnedUrl = "https://example.com/2"
    const bound = bindPinned(workspace, tabId(2), { bookmarkId: bookmarkId("p"), pinnedUrl })

    const view = project({
      workspace: bound,
      windowTabs,
      pinnedTrees: homeWithPin([bookmark("p", pinnedUrl)]),
    })

    expect(shape(view)).toStrictEqual([1, 3])
  })

  it("a pinned split is one node carrying each side's open tab", () => {
    const left = "https://mail.example/"
    const right = "https://calendar.example/"
    const bound = bindPinned(inHome(emptyWorkspace, 5), tabId(5), {
      bookmarkId: bookmarkId("right"),
      pinnedUrl: right,
    })

    const view = project({
      workspace: bound,
      windowTabs: [browserTab(5, { url: Option.some(right) })],
      pinnedTrees: homeWithPin([
        {
          _tag: "PinnedSplit",
          id: bookmarkId("split"),
          title: "Mail | Calendar",
          items: [
            { _tag: "PinnedBookmark", id: bookmarkId("left"), title: "Mail", url: left },
            { _tag: "PinnedBookmark", id: bookmarkId("right"), title: "Calendar", url: right },
          ],
        },
      ]),
    })
    const node = pinnedNodesOf(view)[0]

    expect(
      node?._tag === "PinnedSplit" && node.items.map((item) => item.openTab?.tab.tabId ?? null),
    ).toStrictEqual([null, 5])
  })

  it("carries whether split views can be created", () => {
    expect(project({ canSplit: false }).canSplit).toBe(false)
  })

  it("carries the key the browser assigned to open Spotlight, or none", () => {
    expect([
      project({ spotlightShortcut: "⌥T" }).spotlightShortcut,
      project({ spotlightShortcut: null }).spotlightShortcut,
    ]).toStrictEqual(["⌥T", null])
  })
})

describe("live folders", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const LIVE = bookmarkId("live")
  const liveTree: PinnedTree = [
    { _tag: "PinnedLiveFolder", id: LIVE, title: "Review Requests", source: reviews },
  ]
  const liveItem = (id: string, updatedAt: number): LiveItem => ({
    id,
    title: `PR ${id}`,
    subtitle: "katip-dev/katip#1",
    url: `https://github.com/katip-dev/katip/pull/${id}`,
    updatedAt,
  })
  const fetched = (
    items: ReadonlyArray<LiveItem>,
    seenVersions: Record<string, number> = {},
  ): LiveFolderRecord => ({ items, lastAttempt: { _tag: "Fetched", at: 1000 }, seenVersions })
  const liveFolderOf = (overrides: Partial<SidebarSources>) =>
    pinnedNodesOf(project({ pinnedTrees: homeWithPin(liveTree), ...overrides }))[0] as
      PinnedLiveFolderView | undefined

  it("without a chosen sort, sorts newest first, keeping the order the source returned", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("2", 80), liveItem("1", 50)])]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect([node?.sort, node?.items.map((item) => item.id)]).toStrictEqual(["newest", ["2", "1"]])
  })

  it("sorts by the chosen sort", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("2", 80), liveItem("1", 50)])]]),
        refreshing: new Set(),
        sorts: new Map([[LIVE, "oldest"]]),
      },
    })

    expect([node?.sort, node?.items.map((item) => item.id)]).toStrictEqual(["oldest", ["1", "2"]])
  })

  it("when it failed for not being signed in, gives the page to open to sign in", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([
          [
            LIVE,
            {
              ...fetched([]),
              lastAttempt: { _tag: "Failed", at: 1000, failure: { _tag: "NotSignedIn" } },
            },
          ],
        ]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect(node?.status).toStrictEqual({
      _tag: "Failed",
      reason: "You aren't signed in to GitHub",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://github.com/login",
    })
  })

  it("lists the fetched items with whether each is unread, in the order the source returned", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("1", 50), liveItem("2", 80)], { "2": 80 })]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect(node?.items.map((item) => [item.id, item.isUnseen])).toStrictEqual([
      ["1", true],
      ["2", false],
    ])
  })

  it("once fetched, shows it is ready along with when it was fetched", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([])]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect([node?.title, node?.source, node?.status]).toStrictEqual([
      "Review Requests",
      reviews,
      { _tag: "Ready", refreshedAt: 1000 },
    ])
  })

  it("while fetching, shows it is refreshing and keeps listing the previous items", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("1", 50)])]]),
        refreshing: new Set([LIVE]),
        sorts: new Map(),
      },
    })

    expect([node?.status, node?.items.length]).toStrictEqual([{ _tag: "Refreshing" }, 1])
  })

  it("before any fetch has finished, shows it is refreshing with no items", () => {
    const node = liveFolderOf({})

    expect([node?.status, node?.items]).toStrictEqual([{ _tag: "Refreshing" }, []])
  })

  it("when it failed, gives the reason and the way to fix it", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([
          [
            LIVE,
            {
              ...fetched([]),
              lastAttempt: { _tag: "Failed", at: 1000, failure: { _tag: "TokenRejected" } },
            },
          ],
        ]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect(node?.status).toStrictEqual({
      _tag: "Failed",
      reason: "The GitHub access token is invalid",
      needsPermission: false,
      needsToken: true,
      signInUrl: null,
    })
  })

  it("is expanded or collapsed by the stored state, like a folder", () => {
    expect([
      liveFolderOf({})?.isExpanded,
      liveFolderOf({ folderExpansion: { [LIVE]: true } })?.isExpanded,
    ]).toStrictEqual([false, true])
  })

  it("doesn't peek out from a collapsed folder", () => {
    const view = project({
      pinnedTrees: homeWithPin([folder("f", liveTree)]),
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("1", 50)])]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })
    const node = pinnedNodesOf(view)[0] as PinnedFolderView

    expect([node.children.map((child) => child._tag), node.peekedItems]).toStrictEqual([
      ["PinnedLiveFolder"],
      [],
    ])
  })
})

describe("display language", () => {
  const untitledTab = browserTab(1, { url: Option.none(), title: Option.none() })

  it("names a tab with neither a title nor a URL as a new tab, in the display language", () => {
    const workspace = inHome(switchSpace(emptyWorkspace, WINDOW, spaceId("home")), 1)

    const titles = (["ja", "en"] as const).map((locale) =>
      temporaryTabsOf(
        homeOf(
          project({ workspace, windowTabs: [untitledTab], translator: makeTranslator(locale) }),
        ),
      ).map((tab) => tab.title),
    )

    expect(titles).toStrictEqual([["新しいタブ"], ["New Tab"]])
  })

  it("marks an email without a subject as having none, in the display language", () => {
    const live = bookmarkId("live")
    const node = pinnedNodesOf(
      project({
        pinnedTrees: homeWithPin([
          {
            _tag: "PinnedLiveFolder",
            id: live,
            title: "Inbox",
            source: { _tag: "Gmail", accountIndex: 0, label: null },
          },
        ]),
        liveFolders: {
          records: new Map([
            [
              live,
              {
                items: [
                  {
                    id: "m",
                    title: "",
                    subtitle: "",
                    url: "https://mail.google.com/",
                    updatedAt: 1,
                  },
                ],
                lastAttempt: { _tag: "Fetched", at: 1 },
                seenVersions: {},
              },
            ],
          ]),
          refreshing: new Set(),
          sorts: new Map(),
        },
        translator: makeTranslator("es"),
      }),
    )[0] as PinnedLiveFolderView | undefined

    expect(node?.items.map((item) => item.title)).toStrictEqual(["(sin asunto)"])
  })
})
