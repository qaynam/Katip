import { Array, Option, Order, pipe } from "effect"
import type { ArchiveEntry } from "#modules/archive"
import type { SpaceId } from "#modules/space"
import type { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type {
  PinnedFolderView,
  PinnedItemView,
  PinnedLiveFolderView,
  PinnedNodeView,
  PinnedSplitView,
  SidebarView,
  SpaceView,
  TabView,
} from "#protocol"
import type { PinnedPosition } from "./drag-drop"

export const findActiveSpace = (view: SidebarView): Option.Option<SpaceView> =>
  Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId)

export const otherSpaces = (view: SidebarView): ReadonlyArray<SpaceView> =>
  view.spaces.filter((space) => space.id !== view.activeSpaceId)

export type ArchiveScope = "currentSpace" | "allSpaces"

const newestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (entry: ArchiveEntry) => entry.archivedAt,
)

export const archiveEntriesFor = (
  entries: ReadonlyArray<ArchiveEntry>,
  scope: ArchiveScope,
  spaceId: SpaceId,
): ReadonlyArray<ArchiveEntry> =>
  pipe(
    entries,
    Array.filter((entry) => scope === "allSpaces" || entry.spaceId === spaceId),
    Array.sort(newestFirst),
  )

export const hostOf = (url: string): Option.Option<string> =>
  Option.liftThrowable(() => new URL(url).host)().pipe(Option.filter((host) => host !== ""))

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"])

/**
 * A web page's URL cut down to its host without `www.`, as an address bar shows a URL compactly.
 * None for any other page, such as the new tab page, the browser's own pages and extension pages.
 */
export const compactUrlOf = (url: string): Option.Option<string> =>
  Option.liftThrowable(() => new URL(url))().pipe(
    Option.filter((parsed) => WEB_PROTOCOLS.has(parsed.protocol)),
    Option.map((parsed) => parsed.host.replace(/^www\./, "")),
  )

export type PinnedItemDisplay =
  | { readonly _tag: "Closed"; readonly title: string }
  | { readonly _tag: "AtPinnedUrl"; readonly title: string }
  | { readonly _tag: "NavigatedAway"; readonly title: string; readonly pageTitle: string }

const firstNonEmpty = (...candidates: ReadonlyArray<string>): string =>
  candidates.find((candidate) => candidate.trim() !== "") ?? ""

// The row keeps the pin's name after navigating away, because switching to the page title
// would leave the row unchanged when the pin is renamed. The go-back button already shows that
// the tab has left the pinned URL, so the current page's title appears on hover instead
export const pinnedItemDisplay = (item: PinnedItemView): PinnedItemDisplay => {
  const fallbackTitle = Option.getOrElse(hostOf(item.url), () => item.url)
  if (item.openTab === null) {
    return { _tag: "Closed", title: firstNonEmpty(item.title, fallbackTitle) }
  }
  const { tab, hasNavigatedAway } = item.openTab
  const title = firstNonEmpty(item.title, tab.title, fallbackTitle)
  return hasNavigatedAway
    ? { _tag: "NavigatedAway", title, pageTitle: firstNonEmpty(tab.title, tab.url) }
    : { _tag: "AtPinnedUrl", title }
}

export const childPosition = (
  folder: PinnedFolderView,
  bookmarkId: BookmarkId,
): PinnedPosition | null =>
  pipe(
    Array.findFirstIndex(folder.children, (child) => child.bookmarkId === bookmarkId),
    Option.map((index) => ({ parentId: folder.bookmarkId, index })),
    Option.getOrNull,
  )

export const openSplitViewOf = ({ items: [left, right] }: PinnedSplitView): SplitViewId | null => {
  const splitViewId = left.openTab?.tab.splitViewId ?? null
  return splitViewId !== null && splitViewId === right.openTab?.tab.splitViewId ? splitViewId : null
}

/** Searches inside folders too, but not the halves of a pinned split view. */
export const findPinnedNode = (
  nodes: ReadonlyArray<PinnedNodeView>,
  bookmarkId: BookmarkId,
): Option.Option<PinnedNodeView> => {
  for (const node of nodes) {
    if (node.bookmarkId === bookmarkId) return Option.some(node)
    if (node._tag !== "PinnedFolder") continue
    const found = findPinnedNode(node.children, bookmarkId)
    if (Option.isSome(found)) return found
  }
  return Option.none()
}

/** The folder itself and every folder nested inside it, live folders included. */
export const selfAndDescendantFolderIds = (
  folder: PinnedFolderView | PinnedLiveFolderView,
): ReadonlyArray<BookmarkId> =>
  folder._tag === "PinnedLiveFolder"
    ? [folder.bookmarkId]
    : [
        folder.bookmarkId,
        ...folder.children.flatMap((child) =>
          child._tag === "PinnedFolder" || child._tag === "PinnedLiveFolder"
            ? selfAndDescendantFolderIds(child)
            : [],
        ),
      ]

const tabsOfNode = (node: PinnedNodeView): ReadonlyArray<TabView> => {
  switch (node._tag) {
    case "PinnedItem":
      return node.openTab === null ? [] : [node.openTab.tab]
    case "PinnedSplit":
      return node.items.flatMap(tabsOfNode)
    case "PinnedFolder":
      return node.children.flatMap(tabsOfNode)
    case "PinnedLiveFolder":
      return [...node.items, ...node.hiddenItems].flatMap((item) =>
        item.openTab === null ? [] : [item.openTab],
      )
  }
}

/** The open tab shown anywhere in the view: among a Space's pins, its live folders or its tabs. */
export const findTabView = (view: SidebarView, tabId: TabId): Option.Option<TabView> =>
  Array.findFirst(
    view.spaces.flatMap((space) => [
      ...(space.pinned._tag === "Available" ? space.pinned.nodes.flatMap(tabsOfNode) : []),
      ...space.temporaryEntries.flatMap((entry) =>
        entry._tag === "TemporaryTab" ? [entry.tab] : [...entry.tabs],
      ),
    ]),
    (tab) => tab.tabId === tabId,
  )
