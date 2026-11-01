import { Array, Match, Option, Order } from "effect"
import type { LiveSort, LiveSource } from "#modules/live-folders"
import { SpaceId, SpaceName } from "#modules/space"
import type { SpaceTheme } from "#modules/theme"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type {
  LiveItemView,
  PinnedFolderView,
  PinnedItemView,
  PinnedLiveFolderView,
  PinnedNodeView,
  PinnedPlacement,
  PinnedSplitView,
  SidebarCommand,
  SidebarView,
  SpaceView,
  TabView,
  TemporaryEntry,
  TemporaryPlacement,
} from "#protocol"
import type { CommandResponse } from "../sidepanel/connection/memory-connection"
import { suggestedTheme } from "../sidepanel/logic/space-themes"
import { hostOf } from "../sidepanel/logic/view-queries"
import { messages } from "../sidepanel/messages"
import { withRecomputedPeeks } from "./fixture-peeks"
import {
  liveItem,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  tabView,
  temporaryTab,
} from "../sidepanel/testing/view-builders"

const succeeded = (
  view: SidebarView,
  createdBookmarkId: BookmarkId | null = null,
): CommandResponse => ({ outcome: { _tag: "Succeeded", createdBookmarkId }, view })

const mapSpaces = (view: SidebarView, update: (space: SpaceView) => SpaceView): SidebarView => ({
  ...view,
  spaces: view.spaces.map(update),
})

const mapSpace = (view: SidebarView, spaceId: SpaceId, update: (space: SpaceView) => SpaceView) =>
  mapSpaces(view, (space) => (space.id === spaceId ? update(space) : space))

interface TreeUpdates {
  readonly onItem?: (item: PinnedItemView) => PinnedItemView
  readonly onFolder?: (folder: PinnedFolderView) => PinnedFolderView
  readonly onLiveFolder?: (folder: PinnedLiveFolderView) => PinnedLiveFolderView
}

const mapTree = (
  nodes: ReadonlyArray<PinnedNodeView>,
  updates: TreeUpdates,
): ReadonlyArray<PinnedNodeView> => {
  const {
    onItem = (item) => item,
    onFolder = (folder) => folder,
    onLiveFolder = (folder) => folder,
  } = updates
  return nodes.map((node) =>
    Match.valueTags(node, {
      PinnedItem: onItem,
      PinnedSplit: (split): PinnedNodeView => ({
        ...split,
        items: [onItem(split.items[0]), onItem(split.items[1])],
      }),
      PinnedLiveFolder: onLiveFolder,
      PinnedFolder: (folder) =>
        onFolder({ ...folder, children: mapTree(folder.children, updates) }),
    }),
  )
}

const mapPinned = (
  space: SpaceView,
  update: (nodes: ReadonlyArray<PinnedNodeView>) => ReadonlyArray<PinnedNodeView>,
): SpaceView =>
  space.pinned._tag === "Available"
    ? { ...space, pinned: { ...space.pinned, nodes: update(space.pinned.nodes) } }
    : space

const tabsOfEntry = (entry: TemporaryEntry): ReadonlyArray<TabView> =>
  entry._tag === "TemporaryTab" ? [entry.tab] : entry.tabs

// 分割ビューの片方が閉じたら、残ったタブは 1 つの一時タブに戻る
const updateEntry = (
  entry: TemporaryEntry,
  update: (tab: TabView) => TabView | null,
): ReadonlyArray<TemporaryEntry> => {
  if (entry._tag === "TemporaryTab") {
    const tab = update(entry.tab)
    return tab === null ? [] : [{ ...entry, tab }]
  }
  const [left, right] = entry.tabs.map(update)
  if (left !== null && left !== undefined && right !== null && right !== undefined) {
    return [{ ...entry, tabs: [left, right] }]
  }
  return [left, right].flatMap((tab) =>
    tab === null || tab === undefined ? [] : [temporaryTab({ ...tab, splitViewId: null })],
  )
}

const mapOpenTabs = (view: SidebarView, update: (tab: TabView) => TabView | null): SidebarView =>
  mapSpaces(view, (space) =>
    mapPinned(
      {
        ...space,
        temporaryEntries: space.temporaryEntries.flatMap((entry) => updateEntry(entry, update)),
      },
      (nodes) =>
        mapTree(nodes, {
          onItem: (item) => {
            if (item.openTab === null) return item
            const tab = update(item.openTab.tab)
            return { ...item, openTab: tab === null ? null : { ...item.openTab, tab } }
          },
        }),
    ),
  )

const pinnedNodesOf = (space: SpaceView): ReadonlyArray<PinnedNodeView> =>
  space.pinned._tag === "Available" ? space.pinned.nodes : []

const flattenNodes = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedNodeView> =>
  nodes.flatMap((node) =>
    Match.valueTags(node, {
      PinnedItem: (item): ReadonlyArray<PinnedNodeView> => [item],
      PinnedSplit: (split): ReadonlyArray<PinnedNodeView> => [split, ...split.items],
      PinnedLiveFolder: (folder): ReadonlyArray<PinnedNodeView> => [folder],
      PinnedFolder: (folder): ReadonlyArray<PinnedNodeView> => [
        folder,
        ...flattenNodes(folder.children),
      ],
    }),
  )

const openTabsOf = (space: SpaceView): ReadonlyArray<TabView> => [
  ...space.temporaryEntries.flatMap(tabsOfEntry),
  ...flattenNodes(pinnedNodesOf(space)).flatMap((node) =>
    node._tag === "PinnedItem" && node.openTab !== null ? [node.openTab.tab] : [],
  ),
]

const nextTabId = (view: SidebarView) => {
  const ids = [
    ...view.favorites.map((favorite) => favorite.tabId),
    ...view.spaces.flatMap(openTabsOf).map((tab) => tab.tabId),
  ]
  return TabId.make(Math.max(0, ...ids) + 1)
}

const nextSplitViewId = (view: SidebarView) => {
  const ids = view.spaces
    .flatMap(openTabsOf)
    .flatMap((tab) => (tab.splitViewId === null ? [] : [tab.splitViewId]))
  return SplitViewId.make(Math.max(0, ...ids) + 1)
}

const spaceOwningTab = (view: SidebarView, tabId: TabId): Option.Option<SpaceId> =>
  Array.findFirst(view.spaces, (space) =>
    openTabsOf(space).some((tab) => tab.tabId === tabId),
  ).pipe(Option.map((space) => space.id))

const activateTab = (view: SidebarView, tabId: TabId): SidebarView => {
  const activated = mapOpenTabs(view, (tab) => ({ ...tab, isActive: tab.tabId === tabId }))
  return {
    ...activated,
    activeSpaceId: Option.getOrElse(spaceOwningTab(view, tabId), () => view.activeSpaceId),
    favorites: view.favorites.map((favorite) => ({
      ...favorite,
      isActive: favorite.tabId === tabId,
    })),
  }
}

const openTemporaryTab = (view: SidebarView, spaceId: SpaceId, tab: TabView): SidebarView =>
  activateTab(
    mapSpace(view, spaceId, (space) => ({
      ...space,
      temporaryEntries: [temporaryTab(tab), ...space.temporaryEntries],
    })),
    tab.tabId,
  )

const freshId = (prefix: string, taken: ReadonlySet<string>): string => {
  let counter = taken.size + 1
  while (taken.has(`${prefix}-${counter}`)) counter += 1
  return `${prefix}-${counter}`
}

const bookmarkIds = (view: SidebarView): ReadonlySet<string> =>
  new Set(
    view.spaces.flatMap((space) =>
      flattenNodes(pinnedNodesOf(space)).map((node) => node.bookmarkId),
    ),
  )

const findNode = (view: SidebarView, bookmarkId: BookmarkId): Option.Option<PinnedNodeView> =>
  Array.findFirst(
    view.spaces.flatMap((space) => flattenNodes(pinnedNodesOf(space))),
    (node) => node.bookmarkId === bookmarkId,
  )

const withoutNode = (
  nodes: ReadonlyArray<PinnedNodeView>,
  bookmarkId: BookmarkId,
): ReadonlyArray<PinnedNodeView> =>
  nodes.flatMap((node): ReadonlyArray<PinnedNodeView> => {
    if (node.bookmarkId === bookmarkId) return []
    if (node._tag !== "PinnedFolder") return [node]
    return [{ ...node, children: withoutNode(node.children, bookmarkId) }]
  })

const insertNode = (
  nodes: ReadonlyArray<PinnedNodeView>,
  parentId: BookmarkId | null,
  index: number,
  inserted: PinnedNodeView,
): ReadonlyArray<PinnedNodeView> =>
  parentId === null
    ? [...nodes.slice(0, index), inserted, ...nodes.slice(index)]
    : nodes.map((node) =>
        node._tag === "PinnedFolder"
          ? {
              ...node,
              children:
                node.bookmarkId === parentId
                  ? insertNode(node.children, null, index, inserted)
                  : insertNode(node.children, parentId, index, inserted),
            }
          : node,
      )

const removeFromPinned = (view: SidebarView, bookmarkId: BookmarkId): SidebarView =>
  mapSpaces(view, (space) => mapPinned(space, (nodes) => withoutNode(nodes, bookmarkId)))

const placeInPinned = (
  view: SidebarView,
  placement: PinnedPlacement,
  node: PinnedNodeView,
): SidebarView =>
  mapSpace(view, placement.spaceId, (space) =>
    mapPinned(space, (nodes) => insertNode(nodes, placement.parentId, placement.index, node)),
  )

const insertEntry = (
  entries: ReadonlyArray<TemporaryEntry>,
  placement: TemporaryPlacement,
  inserted: TemporaryEntry,
): ReadonlyArray<TemporaryEntry> => {
  const indexAt = (tabId: TabId) =>
    entries.findIndex((entry) => tabsOfEntry(entry).some((tab) => tab.tabId === tabId))
  const index = Match.valueTags(placement, {
    Top: () => 0,
    Bottom: () => entries.length,
    Above: ({ tabId }) => indexAt(tabId),
    Below: ({ tabId }) => indexAt(tabId) + 1,
  })
  const at = index < 0 ? entries.length : index
  return [...entries.slice(0, at), inserted, ...entries.slice(at)]
}

const placeInTemporary = (
  view: SidebarView,
  spaceId: SpaceId,
  placement: TemporaryPlacement,
  entry: TemporaryEntry,
): SidebarView =>
  mapSpace(view, spaceId, (space) => ({
    ...space,
    temporaryEntries: insertEntry(space.temporaryEntries, placement, entry),
  }))

const removeFromTemporary = (
  view: SidebarView,
  isRemoved: (entry: TemporaryEntry) => boolean,
): SidebarView =>
  mapSpaces(view, (space) => ({
    ...space,
    temporaryEntries: space.temporaryEntries.filter((entry) => !isRemoved(entry)),
  }))

const findTemporaryEntry = (
  view: SidebarView,
  matches: (entry: TemporaryEntry) => boolean,
): Option.Option<TemporaryEntry> =>
  Array.findFirst(
    view.spaces.flatMap((space) => space.temporaryEntries),
    matches,
  )

const isSplitView =
  (splitViewId: SplitViewId) =>
  (entry: TemporaryEntry): boolean =>
    entry._tag === "TemporarySplit" && entry.splitViewId === splitViewId

const containsTab =
  (tabId: TabId) =>
  (entry: TemporaryEntry): boolean =>
    tabsOfEntry(entry).some((tab) => tab.tabId === tabId)

const splitEntry = (splitViewId: SplitViewId, left: TabView, right: TabView): TemporaryEntry => ({
  _tag: "TemporarySplit",
  splitViewId,
  tabs: [
    { ...left, splitViewId },
    { ...right, splitViewId },
  ],
})

const pinnedSplitShowing = (
  view: SidebarView,
  splitViewId: SplitViewId,
): Option.Option<PinnedSplitView> =>
  Array.findFirst(
    view.spaces.flatMap((space) => flattenNodes(pinnedNodesOf(space))),
    (node): node is PinnedSplitView =>
      node._tag === "PinnedSplit" &&
      node.items.every((item) => item.openTab?.tab.splitViewId === splitViewId),
  )

const splitTabs = (view: SidebarView, tabId: TabId, withTabId: TabId): CommandResponse | null => {
  const moving = findTemporaryEntry(view, containsTab(tabId))
  const staying = findTemporaryEntry(view, containsTab(withTabId))
  if (
    Option.isNone(moving) ||
    Option.isNone(staying) ||
    moving.value._tag !== "TemporaryTab" ||
    staying.value._tag !== "TemporaryTab"
  ) {
    return null
  }
  const spaceId = Option.getOrElse(spaceOwningTab(view, withTabId), () => view.activeSpaceId)
  const merged = splitEntry(nextSplitViewId(view), staying.value.tab, moving.value.tab)
  const withoutMoving = removeFromTemporary(view, containsTab(tabId))
  return succeeded(
    activateTab(
      mapSpace(withoutMoving, spaceId, (space) => ({
        ...space,
        temporaryEntries: space.temporaryEntries.map((entry) =>
          containsTab(withTabId)(entry) ? merged : entry,
        ),
      })),
      tabId,
    ),
  )
}

const unsplit = (view: SidebarView, splitViewId: SplitViewId): SidebarView => {
  const separated = mapSpaces(view, (space) => ({
    ...space,
    temporaryEntries: space.temporaryEntries.flatMap((entry) =>
      isSplitView(splitViewId)(entry) ? tabsOfEntry(entry).map(temporaryTab) : [entry],
    ),
  }))
  return mapOpenTabs(separated, (tab) =>
    tab.splitViewId === splitViewId ? { ...tab, splitViewId: null } : tab,
  )
}

const placeSplitInTemporary = (
  view: SidebarView,
  splitViewId: SplitViewId,
  spaceId: SpaceId,
  placement: TemporaryPlacement,
): CommandResponse | null => {
  const temporary = findTemporaryEntry(view, isSplitView(splitViewId))
  if (Option.isSome(temporary)) {
    return succeeded(
      placeInTemporary(
        removeFromTemporary(view, isSplitView(splitViewId)),
        spaceId,
        placement,
        temporary.value,
      ),
    )
  }
  return Option.match(pinnedSplitShowing(view, splitViewId), {
    onNone: () => null,
    onSome: (split) => {
      const [left, right] = split.items.map((item) => item.openTab?.tab)
      if (left === undefined || right === undefined) return null
      return succeeded(
        placeInTemporary(
          removeFromPinned(view, split.bookmarkId),
          spaceId,
          placement,
          splitEntry(splitViewId, left, right),
        ),
      )
    },
  })
}

const placeSplitInPinned = (
  view: SidebarView,
  splitViewId: SplitViewId,
  placement: PinnedPlacement,
): CommandResponse | null =>
  Option.match(findTemporaryEntry(view, isSplitView(splitViewId)), {
    onNone: () => null,
    onSome: (entry) => {
      const [left, right] = tabsOfEntry(entry)
      if (left === undefined || right === undefined) return null
      const taken = bookmarkIds(view)
      const pinOf = (tab: TabView, prefix: string) =>
        pinnedItem(freshId(prefix, taken), {
          title: tab.title,
          url: tab.url,
          openTab: openPinnedTab(tab),
        })
      const split = pinnedSplit(freshId("split", taken), [
        pinOf(left, "split-left"),
        pinOf(right, "split-right"),
      ])
      return succeeded(
        placeInPinned(removeFromTemporary(view, isSplitView(splitViewId)), placement, split),
      )
    },
  })

const openPinned = (view: SidebarView, bookmarkId: BookmarkId): SidebarView => {
  const firstTabId = nextTabId(view)
  const splitViewId = nextSplitViewId(view)
  const openItem = (
    item: PinnedItemView,
    offset: number,
    split: SplitViewId | null,
  ): PinnedItemView => ({
    ...item,
    openTab: {
      tab: {
        ...(item.openTab?.tab ??
          tabView(firstTabId + offset, { title: item.title, url: item.url })),
        splitViewId: split,
      },
      hasNavigatedAway: item.openTab?.hasNavigatedAway ?? false,
    },
  })
  const openItemIfTarget = (item: PinnedItemView) =>
    item.bookmarkId === bookmarkId ? openItem(item, 0, null) : item
  const open = (node: PinnedNodeView): PinnedNodeView =>
    Match.valueTags(node, {
      PinnedItem: openItemIfTarget,
      PinnedSplit: (split): PinnedNodeView =>
        split.bookmarkId === bookmarkId
          ? {
              ...split,
              items: [
                openItem(split.items[0], 0, splitViewId),
                openItem(split.items[1], 1, splitViewId),
              ],
            }
          : split,
      PinnedLiveFolder: (folder): PinnedNodeView => folder,
      PinnedFolder: (folder) => ({ ...folder, children: folder.children.map(open) }),
    })
  const opened = mapSpaces(view, (space) => mapPinned(space, (nodes) => nodes.map(open)))
  const openedTab = Option.flatMap(findNode(opened, bookmarkId), (node) =>
    Option.fromNullishOr(
      Match.valueTags(node, {
        PinnedItem: (item) => item.openTab?.tab,
        PinnedSplit: (split) => split.items[0].openTab?.tab,
        PinnedLiveFolder: () => undefined,
        PinnedFolder: () => undefined,
      }),
    ),
  )
  return Option.match(openedTab, {
    onNone: () => opened,
    onSome: (tab) => activateTab(opened, tab.tabId),
  })
}

const openTabsOfNode = (node: PinnedNodeView): ReadonlyArray<TabView> =>
  flattenNodes([node]).flatMap((candidate) =>
    candidate._tag === "PinnedItem" && candidate.openTab !== null ? [candidate.openTab.tab] : [],
  )

const removePinned = (view: SidebarView, bookmarkId: BookmarkId): SidebarView =>
  Option.match(findNode(view, bookmarkId), {
    onNone: () => view,
    onSome: (node) => {
      const [left, right] = openTabsOfNode(node)
      const remaining: ReadonlyArray<TemporaryEntry> =
        node._tag === "PinnedSplit" &&
        left !== undefined &&
        right !== undefined &&
        left.splitViewId !== null
          ? [splitEntry(left.splitViewId, left, right)]
          : openTabsOfNode(node).map(temporaryTab)
      return mapSpace(removeFromPinned(view, bookmarkId), view.activeSpaceId, (space) => ({
        ...space,
        temporaryEntries: [...remaining, ...space.temporaryEntries],
      }))
    },
  })

const createFolder = (
  view: SidebarView,
  spaceId: SpaceId,
  parentId: BookmarkId | null,
): CommandResponse => {
  const folder = pinnedFolder(freshId("folder", bookmarkIds(view)), { title: "新しいフォルダ" })
  const next = mapSpace(view, spaceId, (space) =>
    mapPinned(space, (nodes) =>
      parentId === null
        ? [...nodes, folder]
        : mapTree(nodes, {
            onFolder: (candidate) =>
              candidate.bookmarkId === parentId
                ? { ...candidate, isExpanded: true, children: [...candidate.children, folder] }
                : candidate,
          }),
    ),
  )
  return succeeded(next, folder.bookmarkId)
}

const MINUTE_MS = 60_000

/** 取得元から読んだことにする見本の項目。新しい順に並べ、先頭の 2 件を未読にする */
const sampleLiveItems = (source: LiveSource, now: number): ReadonlyArray<LiveItemView> => {
  const samples = Match.valueTags(source, {
    Gmail: ({ accountIndex }) =>
      [
        ["来週の打ち合わせの件", "佐藤 花子"],
        ["請求書をお送りします", "経理部"],
        ["勉強会のお知らせ", "コミュニティ運営"],
      ].map(([title, from], index) => ({
        id: `mail-${index}`,
        title: title ?? "",
        subtitle: from ?? "",
        url: `https://mail.google.com/mail/u/${accountIndex}/#inbox/mail-${index}`,
      })),
    GitHub: ({ query }) =>
      [
        ["サイドパネルにライブフォルダを表示する", "katip/katip#212"],
        ["分割ビューの解除で順序が崩れる", "katip/katip#198"],
        ["Spotlight の候補に Space を出す", "katip/katip#187"],
      ].map(([title, repository], index) => ({
        id: `${query}-${index}`,
        title: title ?? "",
        subtitle: repository ?? "",
        url: `https://github.com/katip/katip/pull/${212 - index}`,
      })),
  })
  return samples.map((sample, index) =>
    liveItem(sample.id, {
      ...sample,
      updatedAt: now - (index * 90 + 12) * MINUTE_MS,
      isUnseen: index < 2,
    }),
  )
}

const defaultLiveFolderTitle = (source: LiveSource): string =>
  Match.valueTags(source, {
    Gmail: ({ label }) => label ?? "受信トレイ",
    GitHub: ({ query }) => messages.liveFolder.gitHubQueries[query],
  })

const createLiveFolder = (
  view: SidebarView,
  spaceId: SpaceId,
  parentId: BookmarkId | null,
  source: LiveSource,
  now: number,
): CommandResponse => {
  const folder = pinnedLiveFolder(freshId("live", bookmarkIds(view)), {
    title: defaultLiveFolderTitle(source),
    source,
    status: { _tag: "Ready", refreshedAt: now },
    items: sampleLiveItems(source, now),
  })
  const next = mapSpace(view, spaceId, (space) =>
    mapPinned(space, (nodes) =>
      parentId === null
        ? [...nodes, folder]
        : mapTree(nodes, {
            onFolder: (candidate) =>
              candidate.bookmarkId === parentId
                ? { ...candidate, children: [...candidate.children, folder] }
                : candidate,
          }),
    ),
  )
  return succeeded(next, folder.bookmarkId)
}

const mapLiveFolder = (
  view: SidebarView,
  bookmarkId: BookmarkId,
  update: (folder: PinnedLiveFolderView) => PinnedLiveFolderView,
): SidebarView =>
  mapSpaces(view, (space) =>
    mapPinned(space, (nodes) =>
      mapTree(nodes, {
        onLiveFolder: (folder) => (folder.bookmarkId === bookmarkId ? update(folder) : folder),
      }),
    ),
  )

const byUpdatedAt = Order.mapInput(Order.Number, (item: LiveItemView) => item.updatedAt)
const byTitle = Order.mapInput(Order.String, (item: LiveItemView) => item.title)
// GitHub の補足には番号も入るので、リポジトリは URL から取る
const repositoryOrSender = (item: LiveItemView): string =>
  /^https:\/\/github\.com\/([^/]+\/[^/]+)\//.exec(item.url)?.[1] ?? item.subtitle
const bySource = Order.mapInput(Order.String, repositoryOrSender)

const liveItemOrder = (sort: LiveSort): Order.Order<LiveItemView> =>
  Match.value(sort).pipe(
    Match.when("newest", () => Order.flip(byUpdatedAt)),
    Match.when("oldest", () => byUpdatedAt),
    Match.when("title", () => byTitle),
    Match.when("source", () => Order.combine(bySource, Order.flip(byUpdatedAt))),
    Match.exhaustive,
  )

const sortLiveFolder = (folder: PinnedLiveFolderView, sort: LiveSort): PinnedLiveFolderView => ({
  ...folder,
  sort,
  items: Array.sort(folder.items, liveItemOrder(sort)),
})

const refreshLiveFolder = (folder: PinnedLiveFolderView, now: number): PinnedLiveFolderView =>
  sortLiveFolder(
    {
      ...folder,
      status: { _tag: "Ready", refreshedAt: now },
      items: folder.items.length === 0 ? sampleLiveItems(folder.source, now) : folder.items,
    },
    folder.sort,
  )

const openLiveItem = (view: SidebarView, bookmarkId: BookmarkId, itemId: string): SidebarView => {
  const item = findNode(view, bookmarkId).pipe(
    Option.flatMap((node) =>
      node._tag === "PinnedLiveFolder"
        ? Array.findFirst(node.items, (candidate) => candidate.id === itemId)
        : Option.none(),
    ),
  )
  if (Option.isNone(item)) return view
  const seen = mapLiveFolder(view, bookmarkId, (folder) => ({
    ...folder,
    items: folder.items.map((candidate) =>
      candidate.id === itemId ? { ...candidate, isUnseen: false } : candidate,
    ),
  }))
  return openTemporaryTab(
    seen,
    view.activeSpaceId,
    tabView(nextTabId(view), { title: item.value.title, url: item.value.url }),
  )
}

const moveSpace = (view: SidebarView, spaceId: SpaceId, toIndex: number): SidebarView => {
  const moving = view.spaces.find((space) => space.id === spaceId)
  if (moving === undefined) return view
  const rest = view.spaces.filter((space) => space.id !== spaceId)
  return { ...view, spaces: [...rest.slice(0, toIndex), moving, ...rest.slice(toIndex)] }
}

const createSpace = (
  view: SidebarView,
  draft: { readonly name?: SpaceName; readonly theme?: SpaceTheme },
): SidebarView => {
  const id = SpaceId.make(freshId("space", new Set(view.spaces.map((space) => space.id))))
  const space: SpaceView = {
    id,
    name: draft.name ?? SpaceName.make(`スペース ${view.spaces.length + 1}`),
    theme: draft.theme ?? suggestedTheme(view.spaces),
    pinned: { _tag: "Available", nodes: [], canCreateFolder: true },
    temporaryEntries: [],
  }
  return { ...view, spaces: [...view.spaces, space], activeSpaceId: id }
}

const notReproduced = (view: SidebarView, command: SidebarCommand): CommandResponse => ({
  ...succeeded(view),
  notice: `フィクスチャでは ${command._tag} の結果を再現していません`,
})

const respondWithoutPeeks = (
  command: SidebarCommand,
  view: SidebarView,
  now: number,
): CommandResponse =>
  Match.value(command)
    .pipe(
      Match.tag("SwitchSpace", ({ spaceId }) => succeeded({ ...view, activeSpaceId: spaceId })),
      Match.tag("ActivateTab", ({ tabId }) => succeeded(activateTab(view, tabId))),
      Match.tag("CloseTab", ({ tabId }) =>
        succeeded({
          ...mapOpenTabs(view, (tab) => (tab.tabId === tabId ? null : tab)),
          favorites: view.favorites.filter((favorite) => favorite.tabId !== tabId),
        }),
      ),
      Match.tag("SetFolderExpanded", ({ bookmarkId, isExpanded }) =>
        succeeded(
          mapSpaces(view, (space) =>
            mapPinned(space, (nodes) =>
              mapTree(nodes, {
                onFolder: (folder) =>
                  folder.bookmarkId === bookmarkId ? { ...folder, isExpanded } : folder,
                onLiveFolder: (folder) =>
                  folder.bookmarkId === bookmarkId ? { ...folder, isExpanded } : folder,
              }),
            ),
          ),
        ),
      ),
      Match.tag("RenameSpace", ({ spaceId, name }) =>
        succeeded(mapSpace(view, spaceId, (space) => ({ ...space, name }))),
      ),
      Match.tag("SetSpaceTheme", ({ spaceId, theme }) =>
        succeeded(mapSpace(view, spaceId, (space) => ({ ...space, theme }))),
      ),
      Match.tag("MoveSpace", ({ spaceId, toIndex }) =>
        succeeded(moveSpace(view, spaceId, toIndex)),
      ),
      Match.tag("CreateSpace", (draft) => succeeded(createSpace(view, draft))),
      Match.tag("OpenNewTab", () =>
        succeeded(
          openTemporaryTab(
            view,
            view.activeSpaceId,
            tabView(nextTabId(view), { title: "新しいタブ", url: "chrome://newtab/" }),
          ),
        ),
      ),
      Match.tag("CloseTemporaryTabs", ({ spaceId }) =>
        succeeded(mapSpace(view, spaceId, (space) => ({ ...space, temporaryEntries: [] }))),
      ),
      Match.tag("RenameTab", ({ tabId, title }) =>
        succeeded(
          mapOpenTabs(view, (tab) =>
            tab.tabId === tabId
              ? {
                  ...tab,
                  title: title === "" ? Option.getOrElse(hostOf(tab.url), () => "") : title,
                }
              : tab,
          ),
        ),
      ),
    )
    .pipe(
      Match.tag(
        "SplitTabs",
        ({ tabId, withTabId }) => splitTabs(view, tabId, withTabId) ?? notReproduced(view, command),
      ),
      Match.tag("Unsplit", ({ splitViewId }) => succeeded(unsplit(view, splitViewId))),
      Match.tag(
        "PlaceSplitInTemporary",
        ({ splitViewId, spaceId, placement }) =>
          placeSplitInTemporary(view, splitViewId, spaceId, placement) ??
          notReproduced(view, command),
      ),
      Match.tag(
        "PlaceSplitInPinned",
        ({ splitViewId, placement }) =>
          placeSplitInPinned(view, splitViewId, placement) ?? notReproduced(view, command),
      ),
      Match.tag("OpenPinnedItem", ({ bookmarkId }) => succeeded(openPinned(view, bookmarkId))),
      Match.tag("MovePinnedItem", ({ bookmarkId, placement }) =>
        Option.match(findNode(view, bookmarkId), {
          onNone: () => notReproduced(view, command),
          onSome: (node) =>
            succeeded(placeInPinned(removeFromPinned(view, bookmarkId), placement, node)),
        }),
      ),
      Match.tag("RemovePinnedItem", ({ bookmarkId }) => succeeded(removePinned(view, bookmarkId))),
      Match.tag("RenamePinnedItem", ({ bookmarkId, title }) =>
        succeeded(
          mapSpaces(view, (space) =>
            mapPinned(space, (nodes) =>
              mapTree(nodes, {
                onItem: (item) => (item.bookmarkId === bookmarkId ? { ...item, title } : item),
                onFolder: (folder) =>
                  folder.bookmarkId === bookmarkId ? { ...folder, title } : folder,
                onLiveFolder: (folder) =>
                  folder.bookmarkId === bookmarkId ? { ...folder, title } : folder,
              }),
            ),
          ),
        ),
      ),
      Match.tag("CreateFolder", ({ spaceId, parentId }) => createFolder(view, spaceId, parentId)),
      Match.tag("DeleteFolder", ({ bookmarkId }) => succeeded(removePinned(view, bookmarkId))),
      Match.tag("RemoveArchiveEntry", ({ entryId }) =>
        succeeded({ ...view, archive: view.archive.filter((entry) => entry.id !== entryId) }),
      ),
      Match.tag("UpdateAutoArchive", ({ enabled, idleMinutes }) =>
        succeeded({ ...view, autoArchive: { enabled, idleMinutes } }),
      ),
    )
    .pipe(
      Match.tag("CreateLiveFolder", ({ spaceId, parentId, source }) =>
        createLiveFolder(view, spaceId, parentId, source, now),
      ),
      Match.tag("RefreshLiveFolder", ({ bookmarkId }) =>
        succeeded(mapLiveFolder(view, bookmarkId, (folder) => refreshLiveFolder(folder, now))),
      ),
      Match.tag("MarkLiveFolderSeen", ({ bookmarkId }) =>
        succeeded(
          mapLiveFolder(view, bookmarkId, (folder) => ({
            ...folder,
            items: folder.items.map((item) => ({ ...item, isUnseen: false })),
          })),
        ),
      ),
      Match.tag("OpenLiveItem", ({ bookmarkId, itemId }) =>
        succeeded(openLiveItem(view, bookmarkId, itemId)),
      ),
      Match.tag("SetLiveFolderSort", ({ bookmarkId, sort }) =>
        succeeded(mapLiveFolder(view, bookmarkId, (folder) => sortLiveFolder(folder, sort))),
      ),
      Match.tag("OpenUrl", ({ url }) =>
        succeeded(
          openTemporaryTab(
            view,
            view.activeSpaceId,
            tabView(nextTabId(view), { title: Option.getOrElse(hostOf(url), () => url), url }),
          ),
        ),
      ),
      Match.tag("SetGitHubToken", () => succeeded(view)),
      Match.orElse(() => notReproduced(view, command)),
    )

/**
 * 検証ページで見た目を確かめるための、素朴なコマンドの解釈。background の規則は再現しない。
 *
 * @param now - 取得し直したライブフォルダの時刻に使う
 */
export const respondInFixture = (
  command: SidebarCommand,
  view: SidebarView,
  now: number,
): CommandResponse => {
  const response = respondWithoutPeeks(command, view, now)
  return response.view === undefined
    ? response
    : { ...response, view: withRecomputedPeeks(response.view) }
}
