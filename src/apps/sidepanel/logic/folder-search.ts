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
  /** 空文字は補足が無いことを表す */
  readonly subtitle: string
  readonly pageUrl: string
  readonly favIconUrl: string | null
  /** 最後に動きがあった時刻（ライブの項目なら取得元での更新時刻）。ビューから分からなければ null */
  readonly lastActivityAt: number | null
  readonly isUnseen: boolean
  /** 選んだときに送るコマンド */
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
    // 片側のピンだけを開くと分割ビューにならないので、閉じていれば 2 つ揃えて開く
    PinnedSplit: (split) =>
      split.items.map((item) =>
        pinnedEntry(item, { _tag: "OpenPinnedItem", windowId, bookmarkId: split.bookmarkId }),
      ),
    PinnedLiveFolder: (folder) => folder.items.map((item) => liveEntry(folder, item, windowId)),
    PinnedFolder: (folder) => folder.children.flatMap((child) => nodeEntries(child, windowId)),
  })

/** 入れ子のフォルダの中身も含め、フォルダの中での並び順に並べる */
export const folderSearchEntries = (
  folder: SearchableFolder,
  windowId: WindowId,
): ReadonlyArray<FolderSearchEntry> => nodeEntries(folder, windowId)

const normalized = (text: string) => text.normalize("NFKC").toLowerCase()

/**
 * 空白で区切った語のすべてを、タイトル・補足・URL のどこかに含む項目を、元の並びのまま残す。
 * 大文字と小文字、全角と半角は区別しない。
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
