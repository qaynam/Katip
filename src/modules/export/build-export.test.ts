import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
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
    title: Option.some(title ?? `タブ ${id}`),
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
  spaces: [space(HOME, "ホーム")],
  pinnedTrees: new Map([[HOME, []]]),
  folderIcons: new Map(),
  liveSorts: new Map(),
  workspace: emptyWorkspace,
  tabs: [],
  settings: defaultSettings,
  ...overrides,
})

const exported = (sources: ExportSources) => Result.getOrThrow(buildExport(sources))

const homeOf = (sources: ExportSources) => {
  const home = exported(sources).spaces.find((exportedSpace) => exportedSpace.id === HOME)
  if (home === undefined) throw new Error("ホームが書き出されていない")
  return home
}

const tabTitlesOf = (sources: ExportSources) => homeOf(sources).tabs.map((tab) => tab.title)

describe("ファイルの印", () => {
  it("最新の版の印と、書き出した時刻と、書き出した Katip のバージョンを書く", () => {
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
  it("Space を並び順のまま、ID・名前・テーマとともに書き出す", () => {
    const theme = themeOf([{ hue: 145, chroma: 0.6 }])
    const document = exported(
      sourcesWith({
        spaces: [space(WORK, "仕事"), { ...space(HOME, "ホーム"), theme }],
        pinnedTrees: new Map([
          [HOME, []],
          [WORK, []],
        ]),
      }),
    )

    expect(document.spaces.map(({ id, name, theme }) => ({ id, name, theme }))).toStrictEqual([
      { id: "work", name: "仕事", theme: neutralTheme },
      { id: "home", name: "ホーム", theme },
    ])
  })

  it("ピン留めツリーを読めない Space があれば、一部の Space が欠けたまま書き出さずに失敗する", () => {
    const result = buildExport(
      sourcesWith({
        spaces: [space(HOME), space(WORK)],
        pinnedTrees: new Map([[HOME, []]]),
      }),
    )

    expect(result).toStrictEqual(Result.fail(new PinnedTreeUnavailable({ spaceId: WORK })))
  })
})

describe("ピン留め", () => {
  it("ピン・フォルダ・分割ピン・ライブフォルダを、ツリーの並び順のまま種類ごとの形で書き出す", () => {
    const tree: PinnedTree = [
      pin("1", "メール", "https://mail.example.com/"),
      {
        _tag: "PinnedFolder",
        id: BookmarkId.make("2"),
        title: "読みもの",
        children: [
          pin("3", "記事", "https://news.example.com/a"),
          {
            _tag: "PinnedFolder",
            id: BookmarkId.make("4"),
            title: "料理",
            children: [pin("5", "献立", "https://recipes.example.com/")],
          },
        ],
      },
      {
        _tag: "PinnedSplit",
        id: BookmarkId.make("6"),
        title: "設計 | 課題",
        items: [
          {
            _tag: "PinnedBookmark",
            id: BookmarkId.make("7"),
            title: "設計",
            url: "https://docs.example.com/",
          },
          {
            _tag: "PinnedBookmark",
            id: BookmarkId.make("8"),
            title: "課題",
            url: "https://tracker.example.com/",
          },
        ],
      },
      {
        _tag: "PinnedLiveFolder",
        id: BookmarkId.make("9"),
        title: "受信トレイ",
        source: { _tag: "Gmail", accountIndex: 1, label: "仕事" },
      },
    ]

    expect(homeOf(sourcesWith({ pinnedTrees: new Map([[HOME, tree]]) })).pinned).toStrictEqual([
      { type: "pin", title: "メール", url: "https://mail.example.com/" },
      {
        type: "folder",
        title: "読みもの",
        icon: null,
        children: [
          { type: "pin", title: "記事", url: "https://news.example.com/a" },
          {
            type: "folder",
            title: "料理",
            icon: null,
            children: [{ type: "pin", title: "献立", url: "https://recipes.example.com/" }],
          },
        ],
      },
      {
        type: "split",
        items: [
          { type: "pin", title: "設計", url: "https://docs.example.com/" },
          { type: "pin", title: "課題", url: "https://tracker.example.com/" },
        ],
      },
      {
        type: "liveFolder",
        title: "受信トレイ",
        source: { kind: "gmail", accountIndex: 1, label: "仕事" },
        sort: "newest",
      },
    ])
  })

  it("フォルダには選んだアイコンを書く", () => {
    const tree: PinnedTree = [
      { _tag: "PinnedFolder", id: BookmarkId.make("1"), title: "星", children: [] },
      { _tag: "PinnedFolder", id: BookmarkId.make("2"), title: "無印", children: [] },
    ]

    const home = homeOf(
      sourcesWith({
        pinnedTrees: new Map([[HOME, tree]]),
        folderIcons: new Map([[BookmarkId.make("1"), "star"]]),
      }),
    )

    expect(
      home.pinned.map((node) => (node.type === "folder" ? node.icon : "folder でない")),
    ).toStrictEqual(["star", null])
  })

  it("ライブフォルダには、変えた並べ方と GitHub の取得元を書く", () => {
    const tree: PinnedTree = [
      {
        _tag: "PinnedLiveFolder",
        id: BookmarkId.make("1"),
        title: "レビュー待ち",
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
        title: "レビュー待ち",
        source: { kind: "github", query: "review-requested" },
        sort: "source",
      },
    ])
  })
})

describe("一時タブ", () => {
  const tabs = [browserTab(1), browserTab(2), browserTab(3)]

  it("新しいタブを上に表示する設定なら、サイドパネルと同じく Chrome の並びの逆順に書き出す", () => {
    expect(
      tabTitlesOf(
        sourcesWith({
          tabs,
          workspace: inSpace(HOME, tabs),
          settings: { ...defaultSettings, newTabsOnTop: true },
        }),
      ),
    ).toStrictEqual(["タブ 3", "タブ 2", "タブ 1"])
  })

  it("新しいタブを下に追加する設定なら、Chrome の並びのまま書き出す", () => {
    expect(
      tabTitlesOf(
        sourcesWith({
          tabs,
          workspace: inSpace(HOME, tabs),
          settings: { ...defaultSettings, newTabsOnTop: false },
        }),
      ),
    ).toStrictEqual(["タブ 1", "タブ 2", "タブ 3"])
  })

  it("複数のウィンドウにあれば、ウィンドウごとにサイドパネルの表示順に並べてからつなぐ", () => {
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
    ).toStrictEqual(["タブ 2", "タブ 1", "タブ 4", "タブ 3"])
  })

  it("Space ごとに、その Space の一時タブだけを書き出す", () => {
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
      [{ title: "タブ 1", url: "https://example.com/1" }],
      [{ title: "タブ 2", url: "https://example.com/2" }],
    ])
  })

  it("ピンとして開いているタブは、ピンとして書くので一時タブには含めない", () => {
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
          pinnedTrees: new Map([[HOME, [pin("10", "ピン", "https://example.com/1")]]]),
        }),
      ),
    ).toStrictEqual(["タブ 2"])
  })

  it("名前を付け直したタブは、付け直した名前で書き出す", () => {
    const renamed = browserTab(1, { title: "元の名前" })
    const workspace = setTitleOverride(
      inSpace(HOME, [renamed]),
      renamed.id,
      Option.some("新しい名前"),
    )

    expect(tabTitlesOf(sourcesWith({ tabs: [renamed], workspace }))).toStrictEqual(["新しい名前"])
  })

  it("タイトルの無いタブは、URL を名前にする", () => {
    const untitled = {
      ...browserTab(1, { url: "https://example.com/blank" }),
      title: Option.none(),
    }

    expect(
      tabTitlesOf(sourcesWith({ tabs: [untitled], workspace: inSpace(HOME, [untitled]) })),
    ).toStrictEqual(["https://example.com/blank"])
  })

  it("どの Space にも属さないタブは書き出さない", () => {
    expect(homeOf(sourcesWith({ tabs: [browserTab(1)] })).tabs).toStrictEqual([])
  })

  it("シークレットウィンドウのタブは書き出さない", () => {
    const incognito = browserTab(1, { incognito: true })

    expect(
      homeOf(sourcesWith({ tabs: [incognito], workspace: inSpace(HOME, [incognito]) })).tabs,
    ).toStrictEqual([])
  })

  it("Space のタブが Katip 自身のページへ移っていても、そのタブは書き出さない", () => {
    const settingsPage = browserTab(1, { url: `${EXTENSION_ORIGIN}options/index.html` })

    expect(
      homeOf(sourcesWith({ tabs: [settingsPage], workspace: inSpace(HOME, [settingsPage]) })).tabs,
    ).toStrictEqual([])
  })
})

describe("Favorites", () => {
  it("Chrome の固定タブを、タブストリップの順に Favorites として書き出す", () => {
    const tabs = [
      browserTab(1, { pinned: true, title: "カレンダー", url: "https://calendar.example.com/" }),
      browserTab(2, { pinned: true, title: "音楽", url: "https://music.example.com/" }),
      browserTab(3),
    ]

    expect(exported(sourcesWith({ tabs })).favorites).toStrictEqual([
      { title: "カレンダー", url: "https://calendar.example.com/" },
      { title: "音楽", url: "https://music.example.com/" },
    ])
  })

  it("Favorites のタブは、Space に記録が残っていても一時タブに含めない", () => {
    const favorite = browserTab(1, { pinned: true })

    expect(
      homeOf(sourcesWith({ tabs: [favorite], workspace: inSpace(HOME, [favorite]) })).tabs,
    ).toStrictEqual([])
  })

  it("複数のウィンドウで固定している同じページは、1 つにまとめる", () => {
    const tabs = [
      browserTab(1, {
        windowId: WindowId.make(1),
        index: 0,
        pinned: true,
        url: "https://a.example.com/",
      }),
      browserTab(2, {
        windowId: WindowId.make(2),
        index: 0,
        pinned: true,
        url: "https://a.example.com/",
      }),
      browserTab(3, {
        windowId: WindowId.make(2),
        index: 1,
        pinned: true,
        url: "https://b.example.com/",
      }),
    ]

    expect(exported(sourcesWith({ tabs })).favorites.map((link) => link.url)).toStrictEqual([
      "https://a.example.com/",
      "https://b.example.com/",
    ])
  })

  it("シークレットウィンドウの固定タブは書き出さない", () => {
    const tabs = [browserTab(1, { pinned: true, incognito: true })]

    expect(exported(sourcesWith({ tabs })).favorites).toStrictEqual([])
  })
})

describe("設定", () => {
  it("設定のすべての項目を書き出す", () => {
    const settings = {
      newTabsOnTop: false,
      showAllOpenTabsInCollapsedFolders: true,
      syncTabGroups: true,
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(720) },
      defaultSpaceId: HOME,
      locale: "zh",
      pageShortcuts: { copyUrl: true, copyMarkdownLink: false },
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
