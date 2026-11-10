import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { FavoriteId } from "#modules/favorites"
import { type PinnedNode, PinnedTreeUnavailable, type PinnedTree } from "#modules/pinned"
import { defaultSettings, IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme, themeOf } from "#modules/theme"
import { assignTab, bindPinned, emptyWorkspace, setTitleOverride } from "#modules/workspace"
import { BookmarkId, TabId, WindowId, type BrowserTab } from "#platform/browser"
import { buildExport, type ExportSources } from "./build-export"

const HOME = SpaceId.make("home")
const WORK = SpaceId.make("work")
const EXTENSION_ORIGIN = "chrome-extension://katip-test/"

const space = (id: SpaceId, name: string = id): Space => ({
  id,
  name: SpaceName.make(name),
  theme: neutralTheme,
})

const browserTab = (
  id: number,
  overrides: Partial<Omit<BrowserTab, "url" | "title">> & {
    readonly url?: string
    readonly title?: string
  } = {},
): BrowserTab => {
  const { url, title, ...rest } = overrides
  return {
    id: TabId.make(id),
    windowId: WindowId.make(1),
    index: id,
    url: Option.some(url ?? `https://example.com/${id}`),
    pendingUrl: Option.none(),
    title: Option.some(title ?? `Tab ${id}`),
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
    splitViewId: Option.none(),
    lastAccessed: Option.none(),
    ...rest,
  }
}

const inSpace = (spaceId: SpaceId, tabs: ReadonlyArray<BrowserTab>, workspace = emptyWorkspace) =>
  tabs.reduce((acc, tab) => assignTab(acc, tab.id, spaceId, 0), workspace)

const pin = (id: string, title: string, url: string): PinnedNode => ({
  _tag: "PinnedBookmark",
  id: BookmarkId.make(id),
  title,
  url,
})

const sourcesWith = (overrides: Partial<ExportSources> = {}): ExportSources => ({
  exportedAt: Date.UTC(2026, 10, 2, 3, 4, 5),
  katipVersion: "1.2.3",
  extensionOrigin: EXTENSION_ORIGIN,
  spaces: [space(HOME, "Home")],
  pinnedTrees: new Map([[HOME, []]]),
  folderIcons: new Map(),
  liveSorts: new Map(),
  workspace: emptyWorkspace,
  favorites: [],
  tabs: [],
  settings: defaultSettings,
  ...overrides,
})

const exported = (sources: ExportSources) => Result.getOrThrow(buildExport(sources))

const homeOf = (sources: ExportSources) => {
  const home = exported(sources).spaces.find((exportedSpace) => exportedSpace.id === HOME)
  if (home === undefined) throw new Error("Home wasn't exported")
  return home
}

const tabTitlesOf = (sources: ExportSources) => homeOf(sources).tabs.map((tab) => tab.title)

describe("file marks", () => {
  it("write the latest version's mark, the export time and the exporting Katip's version", () => {
    const document = exported(sourcesWith())

    expect([
      document.format,
      document.version,
      document.exportedAt,
      document.generator,
    ]).toStrictEqual([
      "katip.export",
      1,
      "2026-11-02T03:04:05.000Z",
      { name: "Katip", version: "1.2.3" },
    ])
  })
})

describe("Space", () => {
  it("exports the Spaces in order, with their IDs, names and themes", () => {
    const theme = themeOf([{ hue: 145, chroma: 0.6 }])
    const document = exported(
      sourcesWith({
        spaces: [space(WORK, "Work"), { ...space(HOME, "Home"), theme }],
        pinnedTrees: new Map([
          [HOME, []],
          [WORK, []],
        ]),
      }),
    )

    expect(document.spaces.map(({ id, name, theme }) => ({ id, name, theme }))).toStrictEqual([
      {
        id: "work",
        name: "Work",
        theme: { mode: "auto", colors: [], intensity: 0.7, grain: 0.2 },
      },
      {
        id: "home",
        name: "Home",
        theme: { mode: "auto", colors: [{ hue: 145, chroma: 0.6 }], intensity: 0.7, grain: 0.2 },
      },
    ])
  })

  it("leaves the texture out of a Space's theme, as files of version 1 have no place for it", () => {
    const theme = { ...themeOf([{ hue: 145, chroma: 0.6 }]), texture: "linen" as const }
    const document = exported(
      sourcesWith({
        spaces: [{ ...space(HOME, "Home"), theme }],
        pinnedTrees: new Map([[HOME, []]]),
      }),
    )

    expect(Object.keys(document.spaces[0]?.theme ?? {})).not.toContain("texture")
  })

  it("fails rather than export with Spaces missing when a Space's pinned tree can't be read", () => {
    const result = buildExport(
      sourcesWith({
        spaces: [space(HOME), space(WORK)],
        pinnedTrees: new Map([[HOME, []]]),
      }),
    )

    expect(result).toStrictEqual(Result.fail(new PinnedTreeUnavailable({ spaceId: WORK })))
  })
})

describe("pinned", () => {
  it("exports pins, folders, split pins and live folders in tree order, each in its own shape", () => {
    const tree: PinnedTree = [
      pin("1", "Mail", "https://mail.example.com/"),
      {
        _tag: "PinnedFolder",
        id: BookmarkId.make("2"),
        title: "Reading",
        children: [
          pin("3", "Article", "https://news.example.com/a"),
          {
            _tag: "PinnedFolder",
            id: BookmarkId.make("4"),
            title: "Cooking",
            children: [pin("5", "Meal plan", "https://recipes.example.com/")],
          },
        ],
      },
      {
        _tag: "PinnedSplit",
        id: BookmarkId.make("6"),
        title: "Design | Issues",
        items: [
          {
            _tag: "PinnedBookmark",
            id: BookmarkId.make("7"),
            title: "Design",
            url: "https://docs.example.com/",
          },
          {
            _tag: "PinnedBookmark",
            id: BookmarkId.make("8"),
            title: "Issues",
            url: "https://tracker.example.com/",
          },
        ],
      },
      {
        _tag: "PinnedLiveFolder",
        id: BookmarkId.make("9"),
        title: "Inbox",
        source: { _tag: "Gmail", accountIndex: 1, label: "Work" },
      },
    ]

    expect(homeOf(sourcesWith({ pinnedTrees: new Map([[HOME, tree]]) })).pinned).toStrictEqual([
      { type: "pin", title: "Mail", url: "https://mail.example.com/" },
      {
        type: "folder",
        title: "Reading",
        icon: null,
        children: [
          { type: "pin", title: "Article", url: "https://news.example.com/a" },
          {
            type: "folder",
            title: "Cooking",
            icon: null,
            children: [{ type: "pin", title: "Meal plan", url: "https://recipes.example.com/" }],
          },
        ],
      },
      {
        type: "split",
        items: [
          { type: "pin", title: "Design", url: "https://docs.example.com/" },
          { type: "pin", title: "Issues", url: "https://tracker.example.com/" },
        ],
      },
      {
        type: "liveFolder",
        title: "Inbox",
        source: { kind: "gmail", accountIndex: 1, label: "Work" },
        sort: "newest",
      },
    ])
  })

  it("writes the chosen icon for each folder", () => {
    const tree: PinnedTree = [
      { _tag: "PinnedFolder", id: BookmarkId.make("1"), title: "Starred", children: [] },
      { _tag: "PinnedFolder", id: BookmarkId.make("2"), title: "Plain", children: [] },
    ]

    const home = homeOf(
      sourcesWith({
        pinnedTrees: new Map([[HOME, tree]]),
        folderIcons: new Map([[BookmarkId.make("1"), "star"]]),
      }),
    )

    expect(
      home.pinned.map((node) => (node.type === "folder" ? node.icon : "not a folder")),
    ).toStrictEqual(["star", null])
  })

  it("writes a live folder's changed sort and its GitHub source", () => {
    const tree: PinnedTree = [
      {
        _tag: "PinnedLiveFolder",
        id: BookmarkId.make("1"),
        title: "Awaiting review",
        source: { _tag: "GitHub", query: "review-requested" },
      },
    ]

    const home = homeOf(
      sourcesWith({
        pinnedTrees: new Map([[HOME, tree]]),
        liveSorts: new Map([[BookmarkId.make("1"), "source"]]),
      }),
    )

    expect(home.pinned).toStrictEqual([
      {
        type: "liveFolder",
        title: "Awaiting review",
        source: { kind: "github", query: "review-requested" },
        sort: "source",
      },
    ])
  })
})

describe("temporary tabs", () => {
  const tabs = [browserTab(1), browserTab(2), browserTab(3)]

  it("with new tabs on top, are exported in reverse Chrome order, as the side panel shows them", () => {
    expect(
      tabTitlesOf(
        sourcesWith({
          tabs,
          workspace: inSpace(HOME, tabs),
          settings: { ...defaultSettings, newTabsOnTop: true },
        }),
      ),
    ).toStrictEqual(["Tab 3", "Tab 2", "Tab 1"])
  })

  it("with new tabs at the bottom, are exported in Chrome order", () => {
    expect(
      tabTitlesOf(
        sourcesWith({
          tabs,
          workspace: inSpace(HOME, tabs),
          settings: { ...defaultSettings, newTabsOnTop: false },
        }),
      ),
    ).toStrictEqual(["Tab 1", "Tab 2", "Tab 3"])
  })

  it("across several windows, are ordered per window as each side panel shows them, then joined", () => {
    const spread = [
      browserTab(1, { windowId: WindowId.make(1), index: 0 }),
      browserTab(2, { windowId: WindowId.make(1), index: 1 }),
      browserTab(3, { windowId: WindowId.make(2), index: 0 }),
      browserTab(4, { windowId: WindowId.make(2), index: 1 }),
    ]

    expect(
      tabTitlesOf(
        sourcesWith({
          tabs: [...spread].reverse(),
          workspace: inSpace(HOME, spread),
          settings: { ...defaultSettings, newTabsOnTop: true },
        }),
      ),
    ).toStrictEqual(["Tab 2", "Tab 1", "Tab 4", "Tab 3"])
  })

  it("are exported under their own Space only", () => {
    const home = browserTab(1)
    const work = browserTab(2)

    const document = exported(
      sourcesWith({
        spaces: [space(HOME), space(WORK)],
        pinnedTrees: new Map([
          [HOME, []],
          [WORK, []],
        ]),
        tabs: [home, work],
        workspace: inSpace(WORK, [work], inSpace(HOME, [home])),
      }),
    )

    expect(document.spaces.map((exportedSpace) => exportedSpace.tabs)).toStrictEqual([
      [{ title: "Tab 1", url: "https://example.com/1" }],
      [{ title: "Tab 2", url: "https://example.com/2" }],
    ])
  })

  it("leave out a tab open as a pin, since it is written as the pin", () => {
    const pinnedTab = browserTab(1)
    const temporaryTab = browserTab(2)
    const workspace = bindPinned(inSpace(HOME, [pinnedTab, temporaryTab]), pinnedTab.id, {
      bookmarkId: BookmarkId.make("10"),
      pinnedUrl: "https://example.com/1",
    })

    expect(
      tabTitlesOf(
        sourcesWith({
          tabs: [pinnedTab, temporaryTab],
          workspace,
          pinnedTrees: new Map([[HOME, [pin("10", "Pin", "https://example.com/1")]]]),
        }),
      ),
    ).toStrictEqual(["Tab 2"])
  })

  it("are exported under the name they were renamed to", () => {
    const renamed = browserTab(1, { title: "Original name" })
    const workspace = setTitleOverride(
      inSpace(HOME, [renamed]),
      renamed.id,
      Option.some("New name"),
    )

    expect(tabTitlesOf(sourcesWith({ tabs: [renamed], workspace }))).toStrictEqual(["New name"])
  })

  it("are named by their URL when they have no title", () => {
    const untitled = {
      ...browserTab(1, { url: "https://example.com/blank" }),
      title: Option.none(),
    }

    expect(
      tabTitlesOf(sourcesWith({ tabs: [untitled], workspace: inSpace(HOME, [untitled]) })),
    ).toStrictEqual(["https://example.com/blank"])
  })

  it("leave out tabs that belong to no Space", () => {
    expect(homeOf(sourcesWith({ tabs: [browserTab(1)] })).tabs).toStrictEqual([])
  })

  it("leave out tabs in incognito windows", () => {
    const incognito = browserTab(1, { incognito: true })

    expect(
      homeOf(sourcesWith({ tabs: [incognito], workspace: inSpace(HOME, [incognito]) })).tabs,
    ).toStrictEqual([])
  })

  it("leave out blank new tabs, such as the one a new Space opens with", () => {
    const tabs = [
      browserTab(1, { url: "chrome://newtab/", title: "New Tab" }),
      browserTab(2, { url: "about:blank", title: "" }),
      browserTab(3, { url: "https://example.com/kept" }),
    ]

    expect(
      homeOf(sourcesWith({ tabs, workspace: inSpace(HOME, tabs) })).tabs.map((tab) => tab.url),
    ).toStrictEqual(["https://example.com/kept"])
  })

  it("leave out a Space's tab that has navigated to a Katip page", () => {
    const settingsPage = browserTab(1, { url: `${EXTENSION_ORIGIN}options/index.html` })

    expect(
      homeOf(sourcesWith({ tabs: [settingsPage], workspace: inSpace(HOME, [settingsPage]) })).tabs,
    ).toStrictEqual([])
  })
})

describe("Favorites", () => {
  it("are every saved Favorite in order, closed ones included", () => {
    const favorites = [
      { id: FavoriteId.make("calendar"), title: "Calendar", url: "https://calendar.example.com/" },
      { id: FavoriteId.make("music"), title: "Music", url: "https://music.example.com/" },
    ]

    expect(exported(sourcesWith({ favorites })).favorites).toStrictEqual([
      { title: "Calendar", url: "https://calendar.example.com/" },
      { title: "Music", url: "https://music.example.com/" },
    ])
  })

  it("aren't exported as temporary tabs even when a Space still records their tabs", () => {
    const favorite = browserTab(1, { pinned: true })

    expect(
      homeOf(sourcesWith({ tabs: [favorite], workspace: inSpace(HOME, [favorite]) })).tabs,
    ).toStrictEqual([])
  })
})

describe("settings", () => {
  it("are exported field by field, all that version 1 files hold", () => {
    const settings = {
      newTabsOnTop: false,
      showAllOpenTabsInCollapsedFolders: true,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(720) },
      defaultSpaceId: HOME,
      locale: "zh",
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
      checkForUpdates: false,
      bangs: false,
      spotlightSize: "Large",
      spotlightPosition: { x: 0.5, y: 0.3 },
    } as const

    expect(exported(sourcesWith({ settings })).settings).toStrictEqual({
      newTabsOnTop: false,
      showAllOpenTabsInCollapsedFolders: true,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: 720 },
      defaultSpaceId: "home",
      locale: "zh",
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
    })
  })
})
