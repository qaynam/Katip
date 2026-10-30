import { Array, Option, Order, pipe } from "effect"
import type { ArchiveEntry } from "#modules/archive"
import {
  canCreateFolderInside,
  hasNavigatedAway,
  isFolderExpanded,
  SPACE_ROOT_DEPTH,
  type FolderExpansion,
  type FolderNestingRule,
  type PinnedNode,
  type PinnedTree,
} from "#modules/pinned"
import type { Space, SpaceId, SpaceList } from "#modules/space"
import { displayOrder } from "#modules/tab-order"
import { activeSpaceOf, trackedTab, type TrackedTab, type Workspace } from "#modules/workspace"
import type { BookmarkId, BrowserTab, WindowId } from "#platform/browser"
import type {
  FavoriteView,
  PinnedItemView,
  PinnedNodeView,
  SidebarView,
  SpaceView,
  TabView,
} from "#protocol"

export interface SidebarSources {
  readonly windowId: WindowId
  readonly spaces: SpaceList
  readonly workspace: Workspace
  /** ビューを作るウィンドウのタブ。並び順は問わない。 */
  readonly windowTabs: ReadonlyArray<BrowserTab>
  /** 読めた Space のピン留めツリー。含まれない Space は読めなかったものとして表示する。 */
  readonly pinnedTrees: ReadonlyMap<SpaceId, PinnedTree>
  readonly folderExpansion: FolderExpansion
  readonly preferences: {
    readonly newTabsOnTop: boolean
    readonly showAllOpenTabsInCollapsedFolders: boolean
    readonly syncTabGroups: boolean
  }
  readonly autoArchive: SidebarView["autoArchive"]
  readonly archive: ReadonlyArray<ArchiveEntry>
}

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const urlOf = (tab: BrowserTab) =>
  pipe(
    tab.url,
    Option.orElse(() => tab.pendingUrl),
    Option.getOrElse(() => ""),
  )

const pageTitleOf = (tab: BrowserTab) =>
  pipe(
    tab.title,
    Option.orElse(() => Option.liftPredicate(urlOf(tab), (url) => url !== "")),
    Option.getOrElse(() => "新しいタブ"),
  )

const tabView = (tab: BrowserTab, title: string): TabView => ({
  tabId: tab.id,
  title,
  url: urlOf(tab),
  favIconUrl: Option.getOrNull(tab.favIconUrl),
  isActive: tab.active,
  isLoading: Option.contains(tab.status, "loading"),
  isAudible: tab.audible,
  isMuted: tab.muted,
  isDiscarded: tab.discarded,
})

const favoriteView = (tab: BrowserTab): FavoriteView => ({
  tabId: tab.id,
  title: pageTitleOf(tab),
  url: urlOf(tab),
  favIconUrl: Option.getOrNull(tab.favIconUrl),
  isActive: tab.active,
})

interface SpaceTab {
  readonly tab: BrowserTab
  readonly tracked: TrackedTab
}

const collectBookmarkIds = (tree: PinnedTree): ReadonlySet<BookmarkId> =>
  new Set(
    tree.flatMap((node): ReadonlyArray<BookmarkId> =>
      node._tag === "PinnedFolder" ? [...collectBookmarkIds(node.children)] : [node.id],
    ),
  )

// 同じピンに複数のタブがバインドされている場合（復元の取り違えなど）、ピンに載せるのは
// index の最も小さいタブだけにし、残りは一時タブとして見せる。どれかを隠すと閉じられなくなる
const splitPinnedTabs = (spaceTabs: ReadonlyArray<SpaceTab>, tree: Option.Option<PinnedTree>) => {
  const existing = Option.match(tree, {
    onNone: () => new Set<BookmarkId>(),
    onSome: collectBookmarkIds,
  })
  return Array.reduce(
    spaceTabs,
    {
      byBookmark: new Map<BookmarkId, SpaceTab>(),
      temporary: [] as ReadonlyArray<SpaceTab>,
    },
    (acc, spaceTab) => {
      const bookmarkId = spaceTab.tracked.pinned?.bookmarkId
      if (bookmarkId === undefined || !existing.has(bookmarkId) || acc.byBookmark.has(bookmarkId)) {
        return { ...acc, temporary: [...acc.temporary, spaceTab] }
      }
      return { ...acc, byBookmark: new Map(acc.byBookmark).set(bookmarkId, spaceTab) }
    },
  )
}

interface PinnedProjection {
  readonly openTabs: ReadonlyMap<BookmarkId, SpaceTab>
  readonly folderExpansion: FolderExpansion
  readonly rule: FolderNestingRule
  readonly showAllOpenTabsInCollapsedFolders: boolean
}

const pinnedItemView = (
  bookmark: Extract<PinnedNode, { _tag: "PinnedBookmark" }>,
  projection: PinnedProjection,
): PinnedItemView => {
  const open = Option.fromNullishOr(projection.openTabs.get(bookmark.id))
  return Option.match(open, {
    onNone: () => ({
      _tag: "PinnedItem",
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      openTab: null,
    }),
    onSome: ({ tab, tracked }) => {
      const navigatedAway = hasNavigatedAway(tracked.pinned?.pinnedUrl ?? bookmark.url, urlOf(tab))
      // 別ページへ移動した後もピンの名前を出し続けると、今どのページを見ているか分からなくなる
      const title = navigatedAway ? pageTitleOf(tab) : bookmark.title
      return {
        _tag: "PinnedItem",
        bookmarkId: bookmark.id,
        title,
        url: bookmark.url,
        openTab: { tab: tabView(tab, title), hasNavigatedAway: navigatedAway },
      }
    },
  })
}

const peekableItems = (
  nodes: ReadonlyArray<PinnedNodeView>,
  showAll: boolean,
): ReadonlyArray<PinnedItemView> =>
  nodes.flatMap((node): ReadonlyArray<PinnedItemView> => {
    if (node._tag === "PinnedFolder") return peekableItems(node.children, showAll)
    if (node.openTab === null) return []
    return showAll || node.openTab.tab.isActive ? [node] : []
  })

const pinnedNodeViews = (
  tree: PinnedTree,
  depth: number,
  projection: PinnedProjection,
): ReadonlyArray<PinnedNodeView> =>
  tree.map((node): PinnedNodeView => {
    if (node._tag === "PinnedBookmark") return pinnedItemView(node, projection)
    const children = pinnedNodeViews(node.children, depth + 1, projection)
    const isExpanded = isFolderExpanded(projection.folderExpansion, node.id)
    return {
      _tag: "PinnedFolder",
      bookmarkId: node.id,
      title: node.title,
      isExpanded,
      canCreateSubfolder: canCreateFolderInside(depth, projection.rule),
      children,
      peekedItems: isExpanded
        ? []
        : peekableItems(children, projection.showAllOpenTabsInCollapsedFolders),
    }
  })

const spaceView = (
  space: Space,
  spaceTabs: ReadonlyArray<SpaceTab>,
  sources: SidebarSources,
): SpaceView => {
  const tree = Option.fromNullishOr(sources.pinnedTrees.get(space.id))
  const { byBookmark, temporary } = splitPinnedTabs(spaceTabs, tree)
  const rule = { isTabGroupSyncEnabled: sources.preferences.syncTabGroups }
  const projection: PinnedProjection = {
    openTabs: byBookmark,
    folderExpansion: sources.folderExpansion,
    rule,
    showAllOpenTabsInCollapsedFolders: sources.preferences.showAllOpenTabsInCollapsedFolders,
  }
  return {
    id: space.id,
    name: space.name,
    theme: space.theme,
    pinned: Option.match(tree, {
      onNone: () => ({ _tag: "Unavailable" }),
      onSome: (nodes) => ({
        _tag: "Available",
        nodes: pinnedNodeViews(nodes, SPACE_ROOT_DEPTH + 1, projection),
        canCreateFolder: canCreateFolderInside(SPACE_ROOT_DEPTH, rule),
      }),
    }),
    temporaryTabs: displayOrder(
      temporary.map(({ tab, tracked }) => tabView(tab, tracked.titleOverride ?? pageTitleOf(tab))),
      { newestOnTop: sources.preferences.newTabsOnTop },
    ),
  }
}

/**
 * ウィンドウ 1 つ分のサイドパネルの表示内容を組み立てる。
 *
 * @returns Space が 1 つも無ければ表示できないので none。
 */
export const projectSidebarView = (sources: SidebarSources): Option.Option<SidebarView> => {
  const tabs = Array.sort(sources.windowTabs, byIndex)
  const spaceTabs = Array.getSomes(
    tabs.map((tab) =>
      tab.pinned
        ? Option.none()
        : Option.map(trackedTab(sources.workspace, tab.id), (tracked) => ({ tab, tracked })),
    ),
  )
  const activeSpaceId = pipe(
    activeSpaceOf(sources.workspace, sources.windowId),
    Option.filter((id) => sources.spaces.some((space) => space.id === id)),
    Option.orElse(() => Option.map(Array.head(sources.spaces), (space) => space.id)),
  )
  return Option.map(activeSpaceId, (activeSpaceId) => ({
    windowId: sources.windowId,
    activeSpaceId,
    spaces: sources.spaces.map((space) =>
      spaceView(
        space,
        spaceTabs.filter(({ tracked }) => tracked.spaceId === space.id),
        sources,
      ),
    ),
    favorites: tabs.filter((tab) => tab.pinned).map(favoriteView),
    archive: sources.archive,
    autoArchive: sources.autoArchive,
  }))
}
