import { Match, Option } from "effect"
import type { WindowId } from "#platform/browser"
import type {
  LiveItemView,
  PinnedFolderView,
  PinnedItemView,
  PinnedLiveFolderView,
  PinnedNodeView,
  SidebarCommand,
} from "#protocol"
import { hostOf, pinnedItemDisplay } from "./view-queries"

export type SearchableFolder = PinnedFolderView | PinnedLiveFolderView

export interface FolderSearchEntry {
  readonly key: string
  readonly title: string
  /** An empty string means there is no subtitle. */
  readonly subtitle: string
  readonly pageUrl: string
  readonly favIconUrl: string | null
  /**
   * When the entry last had activity (for live items, when the source updated them). null when
   * the view doesn't tell.
   */
  readonly lastActivityAt: number | null
  readonly isUnseen: boolean
  /** The command to send when the entry is chosen. */
  readonly command: SidebarCommand
}

const pinnedEntry = (item: PinnedItemView, openWhenClosed: SidebarCommand): FolderSearchEntry => {
  const tab = item.openTab?.tab ?? null
  const pageUrl = tab?.url ?? item.url
  return {
    key: `pin:${item.bookmarkId}`,
    title: pinnedItemDisplay(item).title,
    subtitle: Option.getOrElse(hostOf(pageUrl), () => ""),
    pageUrl,
    favIconUrl: tab?.favIconUrl ?? null,
    lastActivityAt: null,
    isUnseen: false,
    command: tab === null ? openWhenClosed : { _tag: "ActivateTab", tabId: tab.tabId },
  }
}

const liveEntry = (
  folder: PinnedLiveFolderView,
  item: LiveItemView,
  windowId: WindowId,
): FolderSearchEntry => ({
  key: `live:${folder.bookmarkId}:${item.id}`,
  title: item.title,
  subtitle: item.subtitle,
  pageUrl: item.url,
  favIconUrl: null,
  lastActivityAt: item.updatedAt,
  isUnseen: item.isUnseen,
  command: { _tag: "OpenLiveItem", windowId, bookmarkId: folder.bookmarkId, itemId: item.id },
})

const nodeEntries = (node: PinnedNodeView, windowId: WindowId): ReadonlyArray<FolderSearchEntry> =>
  Match.valueTags(node, {
    PinnedItem: (item) => [
      pinnedEntry(item, { _tag: "OpenPinnedItem", windowId, bookmarkId: item.bookmarkId }),
    ],
    // Opening only one half doesn't make a split view, so a closed split pin opens both halves
    PinnedSplit: (split) =>
      split.items.map((item) =>
        pinnedEntry(item, { _tag: "OpenPinnedItem", windowId, bookmarkId: split.bookmarkId }),
      ),
    PinnedLiveFolder: (folder) => folder.items.map((item) => liveEntry(folder, item, windowId)),
    PinnedFolder: (folder) => folder.children.flatMap((child) => nodeEntries(child, windowId)),
  })

/** Lists entries in their order within the folder, including those in nested folders. */
export const folderSearchEntries = (
  folder: SearchableFolder,
  windowId: WindowId,
): ReadonlyArray<FolderSearchEntry> => nodeEntries(folder, windowId)

const normalized = (text: string) => text.normalize("NFKC").toLowerCase()

/**
 * Keeps, in their original order, the entries whose title, subtitle, or URL contains every
 * whitespace-separated term. Matching ignores case and full-width/half-width differences.
 */
export const filterFolderSearch = (
  entries: ReadonlyArray<FolderSearchEntry>,
  query: string,
): ReadonlyArray<FolderSearchEntry> => {
  const terms = normalized(query)
    .split(/\s+/)
    .filter((term) => term !== "")
  if (terms.length === 0) return entries
  return entries.filter((entry) => {
    const haystack = normalized(`${entry.title}\n${entry.subtitle}\n${entry.pageUrl}`)
    return terms.every((term) => haystack.includes(term))
  })
}
