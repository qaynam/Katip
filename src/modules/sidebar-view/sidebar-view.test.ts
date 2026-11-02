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
  title: Option.some(`タブ ${id}`),
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
  translator: makeTranslator("ja"),
  preferences: {
    newTabsOnTop: false,
    showAllOpenTabsInCollapsedFolders: false,
    syncTabGroups: false,
  },
  autoArchive: defaultSettings.autoArchive,
  archive: [],
  canSplit: true,
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

describe("アクティブな Space", () => {
  it("ウィンドウに記録されたアクティブ Space を表示する", () => {
    const view = project({ workspace: switchSpace(emptyWorkspace, WINDOW, spaceId("work")) })

    expect(view.activeSpaceId).toBe("work")
  })

  it("記録が無ければ先頭の Space を表示する", () => {
    const view = project({ workspace: emptyWorkspace })

    expect(view.activeSpaceId).toBe("home")
  })

  it("Space が 1 つも無ければビューを作らない", () => {
    expect(projectSidebarView(sources({ spaces: [] }))).toStrictEqual(Option.none())
  })
})

describe("一時タブ", () => {
  const workspace = inHome(switchSpace(emptyWorkspace, WINDOW, spaceId("home")), 1, 2, 3)
  const windowTabs = [browserTab(3), browserTab(1), browserTab(2)]

  it("Chrome のタブの並び順で表示する", () => {
    const view = project({ workspace, windowTabs })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([1, 2, 3])
  })

  it("新しいタブを上に表示する設定では、並び順を逆にする", () => {
    const view = project({
      workspace,
      windowTabs,
      preferences: { ...sources().preferences, newTabsOnTop: true },
    })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([3, 2, 1])
  })

  it("タブ名が上書きされていれば、その名前で表示する", () => {
    const renamed = setTitleOverride(workspace, tabId(1), Option.some("受信箱"))

    const view = project({ workspace: renamed, windowTabs })

    expect(temporaryTabsOf(homeOf(view))[0]?.title).toBe("受信箱")
  })

  it("タイトルがまだ無いタブは URL を表示名にする", () => {
    const view = project({
      workspace,
      windowTabs: [browserTab(1, { title: Option.none() })],
    })

    expect(temporaryTabsOf(homeOf(view))[0]?.title).toBe("https://example.com/1")
  })

  it("別の Space のタブはその Space の一覧に入る", () => {
    const mixed = assignTab(workspace, tabId(4), spaceId("work"), 0)

    const view = project({ workspace: mixed, windowTabs: [...windowTabs, browserTab(4)] })

    expect(view.spaces.map((s) => [s.id, temporaryTabIds(s)])).toStrictEqual([
      ["home", [1, 2, 3]],
      ["work", [4]],
    ])
  })
})

describe("Favorites", () => {
  it("Chrome で固定されたタブを index 順に並べ、どの Space にも表示しない", () => {
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

describe("ピン留め", () => {
  const pinnedUrl = "https://mail.example/inbox"
  const boundWorkspace = bindPinned(inHome(emptyWorkspace, 1), tabId(1), {
    bookmarkId: bookmarkId("mail"),
    pinnedUrl,
  })

  it("開いていないピンは、タブを持たないピンとして表示する", () => {
    const view = project({ pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "メール")]) })

    expect(pinnedNodesOf(view)).toStrictEqual([
      { _tag: "PinnedItem", bookmarkId: "mail", title: "メール", url: pinnedUrl, openTab: null },
    ])
  })

  it("ピンにバインドされたタブは一時タブに出ず、ピンの開いているタブとして表示する", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1, { url: Option.some(pinnedUrl) })],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "メール")]),
    })

    expect({
      temporary: temporaryTabsOf(homeOf(view)).length,
      openTab: (pinnedNodesOf(view)[0] as PinnedItemView).openTab?.tab.tabId,
    }).toStrictEqual({ temporary: 0, openTab: 1 })
  })

  it("ピンから移動していなければブックマークの名前で表示する", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1, { url: Option.some(`${pinnedUrl}?page=2`) })],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "メール")]),
    })
    const item = pinnedNodesOf(view)[0] as PinnedItemView

    expect([item.title, item.openTab?.hasNavigatedAway]).toStrictEqual(["メール", false])
  })

  it("ピンから別のページへ移動していたら、ページのタイトルで表示して移動済みと示す", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [
        browserTab(1, {
          url: Option.some("https://mail.example/settings"),
          title: Option.some("設定"),
        }),
      ],
      pinnedTrees: homeWithPin([bookmark("mail", pinnedUrl, "メール")]),
    })
    const item = pinnedNodesOf(view)[0] as PinnedItemView

    expect([item.title, item.openTab?.hasNavigatedAway]).toStrictEqual(["設定", true])
  })

  it("バインド先のブックマークが無くなったタブは一時タブとして表示する", () => {
    const view = project({
      workspace: boundWorkspace,
      windowTabs: [browserTab(1)],
      pinnedTrees: homeWithPin([]),
    })

    expect(temporaryTabIds(homeOf(view))).toStrictEqual([1])
  })

  it("ピン留めツリーを読めなかった Space は、読めないことを示す", () => {
    const view = project({ pinnedTrees: new Map([[spaceId("work"), []]]) })

    expect(homeOf(view).pinned._tag).toBe("Unavailable")
  })
})

describe("閉じたフォルダに覗かせる分割ピン", () => {
  const leftUrl = "https://spec.example/ja"
  const rightUrl = "https://spec.example/en"
  const splitPin: PinnedTree[number] = {
    _tag: "PinnedSplit",
    id: bookmarkId("pair"),
    title: "仕様書 | Spec",
    items: [
      { _tag: "PinnedBookmark", id: bookmarkId("left"), title: "仕様書", url: leftUrl },
      { _tag: "PinnedBookmark", id: bookmarkId("right"), title: "Spec", url: rightUrl },
    ],
  }
  const collapsedFolderWith = (...children: PinnedTree) => homeWithPin([folder("f", children)])

  /** 分割ピンの右側だけをタブで開いておく */
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

  it("設定がオンなら、片方だけ開いていても、2 つそろった 1 行として覗かせる", () => {
    const view = project({
      ...rightSideOpen(),
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })

  it("どちらの側も開いていなければ覗かせない", () => {
    const view = project({
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([])
  })

  it("設定がオフでも、アクティブなタブを含む分割ピンは 1 行で覗かせる", () => {
    const view = project({
      ...rightSideOpen({ active: true }),
      ...showingAllOpenTabs(false),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })

  it("設定がオフなら、開いていてもアクティブでない分割ピンは覗かせない", () => {
    const view = project({
      ...rightSideOpen({ active: false }),
      ...showingAllOpenTabs(false),
      pinnedTrees: collapsedFolderWith(splitPin),
    })

    expect(peekedOf(view)).toStrictEqual([])
  })

  it("入れ子のフォルダの中の分割ピンも、1 行で覗かせる", () => {
    const view = project({
      ...rightSideOpen(),
      ...showingAllOpenTabs(true),
      pinnedTrees: collapsedFolderWith(folder("inner", [splitPin])),
    })

    expect(peekedOf(view)).toStrictEqual([["left", "right"]])
  })
})

describe("フォルダ", () => {
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

  it("閉じたフォルダは、アクティブなタブを開いているピンだけを見出しの下に覗かせる", () => {
    const view = project({ workspace, windowTabs, pinnedTrees: homeWithPin(tree) })

    expect(peekedIds(view)).toStrictEqual(["a"])
  })

  it("すべて表示する設定では、閉じたフォルダ内の開いているピンをすべて覗かせる", () => {
    const view = project({
      workspace,
      windowTabs,
      pinnedTrees: homeWithPin(tree),
      preferences: { ...sources().preferences, showAllOpenTabsInCollapsedFolders: true },
    })

    expect(peekedIds(view)).toStrictEqual(["a", "b"])
  })

  it("開いたフォルダは何も覗かせない", () => {
    const view = project({
      workspace,
      windowTabs,
      pinnedTrees: homeWithPin(tree),
      folderExpansion: { [bookmarkId("f")]: true },
    })

    expect([folderOf(view).isExpanded, peekedIds(view)]).toStrictEqual([true, []])
  })

  it("タブグループ同期が ON のときは、Space 直下のフォルダの中にフォルダを作れない", () => {
    const view = project({
      pinnedTrees: homeWithPin(tree),
      preferences: { ...sources().preferences, syncTabGroups: true },
    })

    expect(folderOf(view).canCreateSubfolder).toBe(false)
  })

  it("アイコンを選んだフォルダは、そのアイコンを載せる", () => {
    const view = project({
      pinnedTrees: homeWithPin(tree),
      folderIcons: new Map([[bookmarkId("f"), "star"]]),
    })

    expect(folderOf(view).icon).toBe("star")
  })

  it("アイコンを選んでいないフォルダは、アイコンを持たない", () => {
    const view = project({ pinnedTrees: homeWithPin(tree) })

    expect(folderOf(view).icon).toBeNull()
  })
})

describe("分割ビュー", () => {
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

  it("同じ分割ビューの 2 つの一時タブは、左右の順で 1 行にまとまる", () => {
    const view = project({ workspace, windowTabs })

    expect(shape(view)).toStrictEqual([1, [2, 3]])
  })

  it("新しいタブを上に表示する設定でも、分割の左右は入れ替わらない", () => {
    const view = project({
      workspace,
      windowTabs,
      preferences: { ...sources().preferences, newTabsOnTop: true },
    })

    expect(shape(view)).toStrictEqual([[2, 3], 1])
  })

  it("分割の片方がピンに結びついていれば、もう片方は単独の一時タブとして表示する", () => {
    const pinnedUrl = "https://example.com/2"
    const bound = bindPinned(workspace, tabId(2), { bookmarkId: bookmarkId("p"), pinnedUrl })

    const view = project({
      workspace: bound,
      windowTabs,
      pinnedTrees: homeWithPin([bookmark("p", pinnedUrl)]),
    })

    expect(shape(view)).toStrictEqual([1, 3])
  })

  it("分割ピンは、それぞれの側に開いているタブを載せた 1 つのノードになる", () => {
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
          title: "メール | 予定",
          items: [
            { _tag: "PinnedBookmark", id: bookmarkId("left"), title: "メール", url: left },
            { _tag: "PinnedBookmark", id: bookmarkId("right"), title: "予定", url: right },
          ],
        },
      ]),
    })
    const node = pinnedNodesOf(view)[0]

    expect(
      node?._tag === "PinnedSplit" && node.items.map((item) => item.openTab?.tab.tabId ?? null),
    ).toStrictEqual([null, 5])
  })

  it("分割ビューを作れるかどうかをそのままビューに載せる", () => {
    expect(project({ canSplit: false }).canSplit).toBe(false)
  })
})

describe("ライブフォルダ", () => {
  const reviews: LiveSource = { _tag: "GitHub", query: "review-requested" }
  const LIVE = bookmarkId("live")
  const liveTree: PinnedTree = [
    { _tag: "PinnedLiveFolder", id: LIVE, title: "レビュー依頼", source: reviews },
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

  it("並べ方を設定していなければ、新しい順として取得元の順で並べる", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("2", 80), liveItem("1", 50)])]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect([node?.sort, node?.items.map((item) => item.id)]).toStrictEqual(["newest", ["2", "1"]])
  })

  it("設定した並べ方で並べて送る", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("2", 80), liveItem("1", 50)])]]),
        refreshing: new Set(),
        sorts: new Map([[LIVE, "oldest"]]),
      },
    })

    expect([node?.sort, node?.items.map((item) => item.id)]).toStrictEqual(["oldest", ["1", "2"]])
  })

  it("ログインしていなくて失敗していれば、ログインのために開くページを示す", () => {
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
      reason: "GitHub にログインしていません",
      needsPermission: false,
      needsToken: false,
      signInUrl: "https://github.com/login",
    })
  })

  it("取得した項目を、未読かどうかと一緒に取得元の順で並べる", () => {
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

  it("取得を終えていれば、取得した時刻とともに準備できたと示す", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([])]]),
        refreshing: new Set(),
        sorts: new Map(),
      },
    })

    expect([node?.title, node?.source, node?.status]).toStrictEqual([
      "レビュー依頼",
      reviews,
      { _tag: "Ready", refreshedAt: 1000 },
    ])
  })

  it("取得している間は、前回の項目を並べたまま取得中と示す", () => {
    const node = liveFolderOf({
      liveFolders: {
        records: new Map([[LIVE, fetched([liveItem("1", 50)])]]),
        refreshing: new Set([LIVE]),
        sorts: new Map(),
      },
    })

    expect([node?.status, node?.items.length]).toStrictEqual([{ _tag: "Refreshing" }, 1])
  })

  it("まだ一度も取得を終えていなければ、空のまま取得中と示す", () => {
    const node = liveFolderOf({})

    expect([node?.status, node?.items]).toStrictEqual([{ _tag: "Refreshing" }, []])
  })

  it("失敗していれば、理由と直し方を示す", () => {
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
      reason: "GitHub のアクセストークンが無効です",
      needsPermission: false,
      needsToken: true,
      signInUrl: null,
    })
  })

  it("開閉状態はフォルダと同じく保存値に従う", () => {
    expect([
      liveFolderOf({})?.isExpanded,
      liveFolderOf({ folderExpansion: { [LIVE]: true } })?.isExpanded,
    ]).toStrictEqual([false, true])
  })

  it("閉じたフォルダの中のライブフォルダは、見出しの下に覗かせない", () => {
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

describe("表示の言語", () => {
  const untitledTab = browserTab(1, { url: Option.none(), title: Option.none() })

  it("タイトルも URL も無いタブは、新しいタブとして表示の言語で示す", () => {
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

  it("件名の無いメールは、表示の言語で件名なしと示す", () => {
    const live = bookmarkId("live")
    const node = pinnedNodesOf(
      project({
        pinnedTrees: homeWithPin([
          {
            _tag: "PinnedLiveFolder",
            id: live,
            title: "受信トレイ",
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
        translator: makeTranslator("en"),
      }),
    )[0] as PinnedLiveFolderView | undefined

    expect(node?.items.map((item) => item.title)).toStrictEqual(["(no subject)"])
  })
})
