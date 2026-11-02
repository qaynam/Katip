import { Array, Match, Option, Order, pipe } from "effect"
import type { ArchiveEntry } from "#modules/archive"
import type { Translator } from "#modules/i18n"
import {
  DEFAULT_LIVE_SORT,
  explainFailure,
  isUnseen,
  sortLiveItems,
  type LiveFolderRecord,
  type LiveFolderSnapshot,
} from "#modules/live-folders"
import {
  canCreateFolderInside,
  hasNavigatedAway,
  isFolderExpanded,
  SPACE_ROOT_DEPTH,
  type FolderExpansion,
  type FolderIcon,
  type FolderNestingRule,
  type PinnedLiveFolder,
  type PinnedNode,
  type PinnedSplit,
  type PinnedTree,
} from "#modules/pinned"
import type { Space, SpaceId, SpaceList } from "#modules/space"
import { displayOrder } from "#modules/tab-order"
import { activeSpaceOf, trackedTab, type TrackedTab, type Workspace } from "#modules/workspace"
import type { BookmarkId, BrowserTab, WindowId } from "#platform/browser"
import type {
  FavoriteView,
  LiveFolderStatus,
  PinnedItemView,
  PinnedLiveFolderView,
  PinnedNodeView,
  PinnedSplitView,
  SidebarView,
  SpaceView,
  TabView,
  TemporaryEntry,
} from "#protocol"

export interface SidebarSources {
  readonly windowId: WindowId
  readonly spaces: SpaceList
  readonly workspace: Workspace
  /** The tabs of the window the view is for, in any order. */
  readonly windowTabs: ReadonlyArray<BrowserTab>
  /** The pinned trees that could be read. A Space missing here is shown as unreadable. */
  readonly pinnedTrees: ReadonlyMap<SpaceId, PinnedTree>
  readonly folderExpansion: FolderExpansion
  /** A folder missing here has no icon chosen. */
  readonly folderIcons: ReadonlyMap<BookmarkId, FolderIcon>
  readonly liveFolders: LiveFolderSnapshot
  /**
   * The language of the text the view carries, such as failure reasons and the name of an untitled
   * tab.
   */
  readonly translator: Translator
  readonly preferences: {
    readonly newTabsOnTop: boolean
    readonly showAllOpenTabsInCollapsedFolders: boolean
    readonly syncTabGroups: boolean
  }
  readonly autoArchive: SidebarView["autoArchive"]
  readonly archive: ReadonlyArray<ArchiveEntry>
  readonly canSplit: boolean
}

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const urlOf = (tab: BrowserTab) =>
  pipe(
    tab.url,
    Option.orElse(() => tab.pendingUrl),
    Option.getOrElse(() => ""),
  )

/** A tab with neither a title nor a URL (a freshly opened new tab) is named `untitled`. */
const pageTitleOf = (tab: BrowserTab, untitled: string) =>
  pipe(
    tab.title,
    Option.orElse(() => Option.liftPredicate(urlOf(tab), (url) => url !== "")),
    Option.getOrElse(() => untitled),
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
  splitViewId: Option.getOrNull(tab.splitViewId),
})

const favoriteView =
  (untitled: string) =>
  (tab: BrowserTab): FavoriteView => ({
    tabId: tab.id,
    title: pageTitleOf(tab, untitled),
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
      Match.valueTags(node, {
        PinnedBookmark: ({ id }) => [id],
        PinnedSplit: ({ items }) => items.map((item) => item.id),
        PinnedLiveFolder: () => [],
        PinnedFolder: ({ children }) => [...collectBookmarkIds(children)],
      }),
    ),
  )

// When several tabs are bound to the same pin (after a mix-up while restoring, say), only the
// lowest-index one goes on the pin and the rest show as temporary tabs. Not hidden: a hidden tab
// couldn't be closed
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
  readonly folderIcons: ReadonlyMap<BookmarkId, FolderIcon>
  readonly liveFolders: LiveFolderSnapshot
  readonly translator: Translator
  readonly untitledTab: string
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
    onSome: ({ tab, tracked }) => ({
      _tag: "PinnedItem",
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      openTab: {
        tab: tabView(tab, pageTitleOf(tab, projection.untitledTab)),
        hasNavigatedAway: hasNavigatedAway(tracked.pinned?.pinnedUrl ?? bookmark.url, urlOf(tab)),
      },
    }),
  })
}

const isPeekable = (item: PinnedItemView, showAll: boolean): boolean =>
  item.openTab !== null && (showAll || item.openTab.tab.isActive)

/**
 * The items to peek out under a collapsed folder's heading, including those in nested folders, in
 * their order within the folder. A pinned split is returned whole when either side qualifies.
 *
 * @param showAll - Whether every open pin peeks out. When false, only the pin of the active tab
 *   does.
 */
export const peekableItems = (
  nodes: ReadonlyArray<PinnedNodeView>,
  showAll: boolean,
): ReadonlyArray<PinnedItemView | PinnedSplitView> =>
  nodes.flatMap((node): ReadonlyArray<PinnedItemView | PinnedSplitView> => {
    if (node._tag === "PinnedFolder") return peekableItems(node.children, showAll)
    // Not just the qualifying side: one side alone wouldn't look like the two-up row shown when
    // the folder is expanded
    if (node._tag === "PinnedSplit") {
      return node.items.some((item) => isPeekable(item, showAll)) ? [node] : []
    }
    if (node._tag === "PinnedLiveFolder") return []
    return isPeekable(node, showAll) ? [node] : []
  })

const pinnedSplitView = (split: PinnedSplit, projection: PinnedProjection): PinnedSplitView => ({
  _tag: "PinnedSplit",
  bookmarkId: split.id,
  title: split.title,
  items: [pinnedItemView(split.items[0], projection), pinnedItemView(split.items[1], projection)],
})

const liveFolderStatus = (
  live: PinnedLiveFolder,
  record: Option.Option<LiveFolderRecord>,
  isRefreshing: boolean,
  translator: Translator,
): LiveFolderStatus => {
  if (isRefreshing) return { _tag: "Refreshing" }
  return Option.match(record, {
    // Nothing has ever been fetched only right after the folder is created or its record is lost,
    // and both start a fetch at once
    onNone: () => ({ _tag: "Refreshing" }),
    onSome: ({ lastAttempt }) =>
      lastAttempt._tag === "Fetched"
        ? { _tag: "Ready", refreshedAt: lastAttempt.at }
        : { _tag: "Failed", ...explainFailure(lastAttempt.failure, live.source, translator) },
  })
}

const pinnedLiveFolderView = (
  live: PinnedLiveFolder,
  projection: PinnedProjection,
): PinnedLiveFolderView => {
  const record = Option.fromNullishOr(projection.liveFolders.records.get(live.id))
  const sort = projection.liveFolders.sorts.get(live.id) ?? DEFAULT_LIVE_SORT
  return {
    _tag: "PinnedLiveFolder",
    bookmarkId: live.id,
    title: live.title,
    source: live.source,
    isExpanded: isFolderExpanded(projection.folderExpansion, live.id),
    status: liveFolderStatus(
      live,
      record,
      projection.liveFolders.refreshing.has(live.id),
      projection.translator,
    ),
    sort,
    items: Option.match(record, {
      onNone: () => [],
      onSome: (loaded) =>
        sortLiveItems(loaded.items, sort, live.source).map((item) => ({
          ...item,
          title:
            item.title.trim() === ""
              ? projection.translator.t("background.liveFolder.noSubject")
              : item.title,
          isUnseen: isUnseen(loaded, item),
        })),
    }),
  }
}

const pinnedNodeViews = (
  tree: PinnedTree,
  depth: number,
  projection: PinnedProjection,
): ReadonlyArray<PinnedNodeView> =>
  tree.map((node): PinnedNodeView => {
    if (node._tag === "PinnedBookmark") return pinnedItemView(node, projection)
    if (node._tag === "PinnedSplit") return pinnedSplitView(node, projection)
    if (node._tag === "PinnedLiveFolder") return pinnedLiveFolderView(node, projection)
    const children = pinnedNodeViews(node.children, depth + 1, projection)
    const isExpanded = isFolderExpanded(projection.folderExpansion, node.id)
    return {
      _tag: "PinnedFolder",
      bookmarkId: node.id,
      title: node.title,
      icon: projection.folderIcons.get(node.id) ?? null,
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
    folderIcons: sources.folderIcons,
    liveFolders: sources.liveFolders,
    translator: sources.translator,
    untitledTab: sources.translator.t("common.newTab"),
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
    temporaryEntries: displayOrder(
      temporaryEntriesOf(
        temporary.map(({ tab, tracked }) =>
          tabView(tab, tracked.titleOverride ?? pageTitleOf(tab, projection.untitledTab)),
        ),
      ),
      { newestOnTop: sources.preferences.newTabsOnTop },
    ),
  }
}

// Chrome always keeps the two tabs of a split view next to each other, so merging neighbors with
// the same split ID in the index-ordered list is enough. When only one of them is a temporary tab
// of this Space (the other is a pin or in another Space), it shows as a row of its own
const temporaryEntriesOf = (tabs: ReadonlyArray<TabView>): ReadonlyArray<TemporaryEntry> =>
  tabs.reduce<ReadonlyArray<TemporaryEntry>>((entries, tab) => {
    const previous = entries.at(-1)
    if (
      tab.splitViewId !== null &&
      previous?._tag === "TemporaryTab" &&
      previous.tab.splitViewId === tab.splitViewId
    ) {
      return [
        ...entries.slice(0, -1),
        { _tag: "TemporarySplit", splitViewId: tab.splitViewId, tabs: [previous.tab, tab] },
      ]
    }
    return [...entries, { _tag: "TemporaryTab", tab }]
  }, [])

/**
 * Builds what the side panel shows for one window.
 *
 * @returns None when there are no Spaces, since there is nothing to show.
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
    favorites: tabs
      .filter((tab) => tab.pinned)
      .map(favoriteView(sources.translator.t("common.newTab"))),
    archive: sources.archive,
    autoArchive: sources.autoArchive,
    canSplit: sources.canSplit,
  }))
}
