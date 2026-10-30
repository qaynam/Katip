import { Array, Match, Option } from "effect"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { BookmarkId, TabId } from "#platform/browser"
import type {
  PinnedFolderView,
  PinnedItemView,
  PinnedNodeView,
  SidebarCommand,
  SidebarView,
  SpaceView,
  TabView,
} from "#protocol"
import type { CommandResponse } from "../sidepanel/connection/memory-connection"
import { hostOf, suggestedSpaceColor } from "../sidepanel/logic/view-queries"
import { pinnedFolder, tabView } from "../sidepanel/testing/view-builders"

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

const mapTree = (
  nodes: ReadonlyArray<PinnedNodeView>,
  onItem: (item: PinnedItemView) => PinnedItemView,
  onFolder: (folder: PinnedFolderView) => PinnedFolderView = (folder) => folder,
): ReadonlyArray<PinnedNodeView> =>
  nodes.map((node) =>
    node._tag === "PinnedItem"
      ? onItem(node)
      : onFolder({
          ...node,
          children: mapTree(node.children, onItem, onFolder),
          peekedItems: node.peekedItems.map(onItem),
        }),
  )

const mapPinned = (
  space: SpaceView,
  update: (nodes: ReadonlyArray<PinnedNodeView>) => ReadonlyArray<PinnedNodeView>,
): SpaceView =>
  space.pinned._tag === "Available"
    ? { ...space, pinned: { ...space.pinned, nodes: update(space.pinned.nodes) } }
    : space

const mapOpenTabs = (view: SidebarView, update: (tab: TabView) => TabView | null): SidebarView =>
  mapSpaces(view, (space) =>
    mapPinned(
      {
        ...space,
        temporaryTabs: space.temporaryTabs.flatMap((tab) => update(tab) ?? []),
      },
      (nodes) =>
        mapTree(nodes, (item) => {
          if (item.openTab === null) return item
          const tab = update(item.openTab.tab)
          return { ...item, openTab: tab === null ? null : { ...item.openTab, tab } }
        }),
    ),
  )

const pinnedNodesOf = (space: SpaceView): ReadonlyArray<PinnedNodeView> =>
  space.pinned._tag === "Available" ? space.pinned.nodes : []

const flattenNodes = (nodes: ReadonlyArray<PinnedNodeView>): ReadonlyArray<PinnedNodeView> =>
  nodes.flatMap((node) =>
    node._tag === "PinnedItem" ? [node] : [node, ...flattenNodes(node.children)],
  )

const openTabsOf = (space: SpaceView): ReadonlyArray<TabView> => [
  ...space.temporaryTabs,
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
      temporaryTabs: [tab, ...space.temporaryTabs],
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
        : mapTree(
            nodes,
            (item) => item,
            (candidate) =>
              candidate.bookmarkId === parentId
                ? { ...candidate, isExpanded: true, children: [...candidate.children, folder] }
                : candidate,
          ),
    ),
  )
  return succeeded(next, folder.bookmarkId)
}

const moveSpace = (view: SidebarView, spaceId: SpaceId, toIndex: number): SidebarView => {
  const moving = view.spaces.find((space) => space.id === spaceId)
  if (moving === undefined) return view
  const rest = view.spaces.filter((space) => space.id !== spaceId)
  return { ...view, spaces: [...rest.slice(0, toIndex), moving, ...rest.slice(toIndex)] }
}

const createSpace = (
  view: SidebarView,
  draft: Partial<Pick<Space, "name" | "color">>,
): SidebarView => {
  const id = SpaceId.make(freshId("space", new Set(view.spaces.map((space) => space.id))))
  const space: SpaceView = {
    id,
    name: draft.name ?? SpaceName.make(`スペース ${view.spaces.length + 1}`),
    color: draft.color ?? suggestedSpaceColor(view.spaces),
    pinned: { _tag: "Available", nodes: [], canCreateFolder: true },
    temporaryTabs: [],
  }
  return { ...view, spaces: [...view.spaces, space], activeSpaceId: id }
}

const notReproduced = (view: SidebarView, command: SidebarCommand): CommandResponse => ({
  ...succeeded(view),
  notice: `フィクスチャでは ${command._tag} の結果を再現していません`,
})

/**
 * 検証ページで見た目を確かめるための、素朴なコマンドの解釈。background の規則は再現しない。
 */
export const respondInFixture = (command: SidebarCommand, view: SidebarView): CommandResponse =>
  Match.value(command).pipe(
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
            mapTree(
              nodes,
              (item) => item,
              (folder) => (folder.bookmarkId === bookmarkId ? { ...folder, isExpanded } : folder),
            ),
          ),
        ),
      ),
    ),
    Match.tag("RenameSpace", ({ spaceId, name }) =>
      succeeded(mapSpace(view, spaceId, (space) => ({ ...space, name }))),
    ),
    Match.tag("RecolorSpace", ({ spaceId, color }) =>
      succeeded(mapSpace(view, spaceId, (space) => ({ ...space, color }))),
    ),
    Match.tag("MoveSpace", ({ spaceId, toIndex }) => succeeded(moveSpace(view, spaceId, toIndex))),
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
      succeeded(mapSpace(view, spaceId, (space) => ({ ...space, temporaryTabs: [] }))),
    ),
    Match.tag("RenameTab", ({ tabId, title }) =>
      succeeded(
        mapOpenTabs(view, (tab) =>
          tab.tabId === tabId
            ? { ...tab, title: title === "" ? Option.getOrElse(hostOf(tab.url), () => "") : title }
            : tab,
        ),
      ),
    ),
    Match.tag("OpenPinnedItem", ({ bookmarkId }) => {
      const tabId = nextTabId(view)
      const opened = mapSpaces(view, (space) =>
        mapPinned(space, (nodes) =>
          mapTree(nodes, (item) =>
            item.bookmarkId === bookmarkId
              ? {
                  ...item,
                  openTab: {
                    tab: tabView(tabId, { title: item.title, url: item.url }),
                    hasNavigatedAway: false,
                  },
                }
              : item,
          ),
        ),
      )
      return succeeded(activateTab(opened, tabId))
    }),
    Match.tag("RenamePinnedItem", ({ bookmarkId, title }) =>
      succeeded(
        mapSpaces(view, (space) =>
          mapPinned(space, (nodes) =>
            mapTree(
              nodes,
              (item) => (item.bookmarkId === bookmarkId ? { ...item, title } : item),
              (folder) => (folder.bookmarkId === bookmarkId ? { ...folder, title } : folder),
            ),
          ),
        ),
      ),
    ),
    Match.tag("CreateFolder", ({ spaceId, parentId }) => createFolder(view, spaceId, parentId)),
    Match.tag("RemoveArchiveEntry", ({ entryId }) =>
      succeeded({ ...view, archive: view.archive.filter((entry) => entry.id !== entryId) }),
    ),
    Match.tag("UpdateAutoArchive", ({ enabled, idleMinutes }) =>
      succeeded({ ...view, autoArchive: { enabled, idleMinutes } }),
    ),
    Match.orElse(() => notReproduced(view, command)),
  )
