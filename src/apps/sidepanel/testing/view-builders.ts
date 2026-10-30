import { ArchiveEntryId, type ArchiveEntry } from "#modules/archive"
import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme } from "#modules/theme"
import { BookmarkId, TabId, WindowId } from "#platform/browser"
import type {
  FavoriteView,
  OpenPinnedTab,
  PinnedFolderView,
  PinnedItemView,
  PinnedNodeView,
  SidebarView,
  SpaceView,
  TabView,
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
  ...overrides,
})

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

export const spaceView = (
  id: string,
  overrides: Partial<Omit<SpaceView, "id" | "pinned">> & {
    readonly pinnedNodes?: ReadonlyArray<PinnedNodeView>
    readonly pinned?: SpaceView["pinned"]
  } = {},
): SpaceView => {
  const { pinnedNodes = [], pinned, ...rest } = overrides
  return {
    id: SpaceId.make(id),
    name: SpaceName.make(id),
    theme: neutralTheme,
    pinned: pinned ?? { _tag: "Available", nodes: pinnedNodes, canCreateFolder: true },
    temporaryTabs: [],
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
    ...overrides,
    spaces,
  }
}
