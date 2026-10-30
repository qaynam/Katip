import { Option } from "effect"
import { describe, expect, it } from "vitest"
import type { PinnedTree } from "#modules/pinned"
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
import { BookmarkId, TabId, WindowId, type BrowserTab } from "#platform/browser"
import type { PinnedFolderView, PinnedItemView, SidebarView, SpaceView } from "#protocol"
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
  preferences: {
    newTabsOnTop: false,
    showAllOpenTabsInCollapsedFolders: false,
    syncTabGroups: false,
  },
  autoArchive: defaultSettings.autoArchive,
  archive: [],
  ...overrides,
})

const inHome = (workspace: Workspace, ...ids: ReadonlyArray<number>) =>
  ids.reduce((acc, id) => assignTab(acc, tabId(id), spaceId("home"), 0), workspace)

const project = (overrides: Partial<SidebarSources> = {}): SidebarView =>
  Option.getOrThrow(projectSidebarView(sources(overrides)))

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

    expect(homeOf(view).temporaryTabs.map((t) => t.tabId)).toStrictEqual([1, 2, 3])
  })

  it("新しいタブを上に表示する設定では、並び順を逆にする", () => {
    const view = project({
      workspace,
      windowTabs,
      preferences: { ...sources().preferences, newTabsOnTop: true },
    })

    expect(homeOf(view).temporaryTabs.map((t) => t.tabId)).toStrictEqual([3, 2, 1])
  })

  it("タブ名が上書きされていれば、その名前で表示する", () => {
    const renamed = setTitleOverride(workspace, tabId(1), Option.some("受信箱"))

    const view = project({ workspace: renamed, windowTabs })

    expect(homeOf(view).temporaryTabs[0]?.title).toBe("受信箱")
  })

  it("タイトルがまだ無いタブは URL を表示名にする", () => {
    const view = project({
      workspace,
      windowTabs: [browserTab(1, { title: Option.none() })],
    })

    expect(homeOf(view).temporaryTabs[0]?.title).toBe("https://example.com/1")
  })

  it("別の Space のタブはその Space の一覧に入る", () => {
    const mixed = assignTab(workspace, tabId(4), spaceId("work"), 0)

    const view = project({ workspace: mixed, windowTabs: [...windowTabs, browserTab(4)] })

    expect(view.spaces.map((s) => [s.id, s.temporaryTabs.map((t) => t.tabId)])).toStrictEqual([
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
      home: homeOf(view).temporaryTabs.map((t) => t.tabId),
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
      temporary: homeOf(view).temporaryTabs.length,
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

    expect(homeOf(view).temporaryTabs.map((t) => t.tabId)).toStrictEqual([1])
  })

  it("ピン留めツリーを読めなかった Space は、読めないことを示す", () => {
    const view = project({ pinnedTrees: new Map([[spaceId("work"), []]]) })

    expect(homeOf(view).pinned._tag).toBe("Unavailable")
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
})
