import { ArchiveEntryId, type ArchiveEntry } from "#modules/archive"
import type { LiveSource } from "#modules/live-folders"
import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"
import type {
  FavoriteView,
  LiveItemView,
  OpenPinnedTab,
  PinnedFolderView,
  PinnedItemView,
  PinnedLiveFolderView,
  PinnedNodeView,
  PinnedSplitView,
  SidebarView,
  SpaceView,
  TabView,
  TemporaryEntry,
} from "#protocol"

export const tabView = (id: number, overrides: Partial<Omit<TabView, "tabId">> = {}): TabView => ({
  tabId: TabId.make(id),
  title: `タブ ${id}`,
  url: `https://example.com/${id}`,
  favIconUrl: null,
  isActive: false,
  isLoading: false,
  isAudible: false,
  isMuted: false,
  isDiscarded: false,
  splitViewId: null,
  ...overrides,
})

export const temporaryTab = (tab: TabView): TemporaryEntry => ({ _tag: "TemporaryTab", tab })

/** 2 つのタブに同じ splitViewId を付けて、1 つの分割ビューの行にする */
export const temporarySplit = (id: number, left: TabView, right: TabView): TemporaryEntry => {
  const splitViewId = SplitViewId.make(id)
  return {
    _tag: "TemporarySplit",
    splitViewId,
    tabs: [
      { ...left, splitViewId },
      { ...right, splitViewId },
    ],
  }
}

export const openPinnedTab = (
  tab: TabView,
  overrides: Partial<Omit<OpenPinnedTab, "tab">> = {},
): OpenPinnedTab => ({ tab, hasNavigatedAway: false, ...overrides })

export const pinnedItem = (
  id: string,
  overrides: Partial<Omit<PinnedItemView, "_tag" | "bookmarkId">> = {},
): PinnedItemView => ({
  _tag: "PinnedItem",
  bookmarkId: BookmarkId.make(id),
  title: `ピン ${id}`,
  url: `https://example.com/pinned/${id}`,
  openTab: null,
  ...overrides,
})

export const pinnedSplit = (
  id: string,
  items: readonly [PinnedItemView, PinnedItemView],
  overrides: Partial<Omit<PinnedSplitView, "_tag" | "bookmarkId" | "items">> = {},
): PinnedSplitView => ({
  _tag: "PinnedSplit",
  bookmarkId: BookmarkId.make(id),
  title: `${items[0].title} | ${items[1].title}`,
  items,
  ...overrides,
})

export const pinnedFolder = (
  id: string,
  overrides: Partial<Omit<PinnedFolderView, "_tag" | "bookmarkId">> = {},
): PinnedFolderView => ({
  _tag: "PinnedFolder",
  bookmarkId: BookmarkId.make(id),
  title: `フォルダ ${id}`,
  isExpanded: true,
  canCreateSubfolder: true,
  children: [],
  peekedItems: [],
  ...overrides,
})

export const liveItem = (id: string, overrides: Partial<LiveItemView> = {}): LiveItemView => ({
  id,
  title: `項目 ${id}`,
  subtitle: "",
  url: `https://mail.google.com/mail/u/0/#inbox/${id}`,
  updatedAt: 0,
  isUnseen: false,
  ...overrides,
})

const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }

export const pinnedLiveFolder = (
  id: string,
  overrides: Partial<Omit<PinnedLiveFolderView, "_tag" | "bookmarkId">> = {},
): PinnedLiveFolderView => ({
  _tag: "PinnedLiveFolder",
  bookmarkId: BookmarkId.make(id),
  title: `ライブフォルダ ${id}`,
  source: inbox,
  isExpanded: true,
  status: { _tag: "Ready", refreshedAt: 0 },
  sort: "newest",
  items: [],
  ...overrides,
})

/** 一時タブが分割ビューを含まないなら temporaryTabs でタブだけを並べてよい */
export const spaceView = (
  id: string,
  overrides: Partial<Omit<SpaceView, "id" | "pinned">> & {
    readonly pinnedNodes?: ReadonlyArray<PinnedNodeView>
    readonly pinned?: SpaceView["pinned"]
    readonly temporaryTabs?: ReadonlyArray<TabView>
  } = {},
): SpaceView => {
  const { pinnedNodes = [], pinned, temporaryTabs = [], ...rest } = overrides
  return {
    id: SpaceId.make(id),
    name: SpaceName.make(id),
    theme: neutralTheme,
    pinned: pinned ?? { _tag: "Available", nodes: pinnedNodes, canCreateFolder: true },
    temporaryEntries: temporaryTabs.map(temporaryTab),
    ...rest,
  }
}

export const favoriteView = (
  id: number,
  overrides: Partial<Omit<FavoriteView, "tabId">> = {},
): FavoriteView => ({
  tabId: TabId.make(id),
  title: `お気に入り ${id}`,
  url: `https://example.com/favorite/${id}`,
  favIconUrl: null,
  isActive: false,
  ...overrides,
})

export const archiveEntry = (
  id: string,
  overrides: Partial<Omit<ArchiveEntry, "id">> = {},
): ArchiveEntry => ({
  id: ArchiveEntryId.make(id),
  url: `https://example.com/archived/${id}`,
  title: `アーカイブ ${id}`,
  spaceId: SpaceId.make("work"),
  archivedAt: 0,
  ...overrides,
})

export const sidebarView = (
  overrides: Partial<SidebarView> & { readonly spaces?: ReadonlyArray<SpaceView> } = {},
): SidebarView => {
  const spaces = overrides.spaces ?? [spaceView("work")]
  return {
    windowId: WindowId.make(1),
    activeSpaceId: spaces[0]?.id ?? SpaceId.make("work"),
    favorites: [],
    archive: [],
    autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(360) },
    canSplit: true,
    ...overrides,
    spaces,
  }
}
