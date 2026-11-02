import { Array, Match, Option, Order, pipe, Result } from "effect"
import { DEFAULT_LIVE_SORT, type LiveSort, type LiveSource } from "#modules/live-folders"
import {
  PinnedTreeUnavailable,
  type FolderIcon,
  type PinnedBookmark,
  type PinnedTree,
} from "#modules/pinned"
import type { Settings } from "#modules/settings"
import type { Space, SpaceId, SpaceList } from "#modules/space"
import { displayOrder } from "#modules/tab-order"
import type { SpaceTheme } from "#modules/theme"
import { trackedTab, type Workspace } from "#modules/workspace"
import type { BookmarkId, BrowserTab } from "#platform/browser"
import { EXPORT_FORMAT, LATEST_EXPORT_VERSION, type LatestExport } from "./export-file"

type ExportedSpace = LatestExport["spaces"][number]
type ExportedNode = ExportedSpace["pinned"][number]
type ExportedLink = ExportedSpace["tabs"][number]
type ExportedPin = Extract<ExportedNode, { readonly type: "pin" }>
type ExportedLiveSource = Extract<ExportedNode, { readonly type: "liveFolder" }>["source"]

export interface ExportSources {
  /** エポックミリ秒。 */
  readonly exportedAt: number
  /** 書き出す Katip 自身のバージョン。 */
  readonly katipVersion: string
  /** `chrome-extension://<id>/` の形。Katip 自身のページのタブは書き出さない。 */
  readonly extensionOrigin: string
  readonly spaces: SpaceList
  /** 読めた Space のピン留めツリー。含まれない Space があれば書き出さない。 */
  readonly pinnedTrees: ReadonlyMap<SpaceId, PinnedTree>
  /** 含まれないフォルダはアイコンを選んでいない。 */
  readonly folderIcons: ReadonlyMap<BookmarkId, FolderIcon>
  /** 含まれないライブフォルダは既定の並べ方。 */
  readonly liveSorts: ReadonlyMap<BookmarkId, LiveSort>
  readonly workspace: Workspace
  /** すべてのウィンドウのタブ。並び順は問わない。 */
  readonly tabs: ReadonlyArray<BrowserTab>
  readonly settings: Settings
}

const byWindowThenIndex = Order.combine(
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.windowId),
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index),
)

const urlOf = (tab: BrowserTab) =>
  pipe(
    tab.url,
    Option.orElse(() => tab.pendingUrl),
    Option.getOrElse(() => ""),
  )

const pageTitleOf = (tab: BrowserTab) => Option.getOrElse(tab.title, () => urlOf(tab))

const themeOf = (theme: SpaceTheme): ExportedSpace["theme"] => ({
  mode: theme.mode,
  colors: theme.colors.map(({ hue, chroma }) => ({ hue, chroma })),
  intensity: theme.intensity,
  grain: theme.grain,
})

const pinOf = (bookmark: PinnedBookmark): ExportedPin => ({
  type: "pin",
  title: bookmark.title,
  url: bookmark.url,
})

const liveSourceOf = (source: LiveSource): ExportedLiveSource =>
  Match.valueTags(source, {
    Gmail: ({ accountIndex, label }): ExportedLiveSource => ({
      kind: "gmail",
      accountIndex,
      label,
    }),
    GitHub: ({ query }): ExportedLiveSource => ({ kind: "github", query }),
  })

const nodesOf = (tree: PinnedTree, sources: ExportSources): ReadonlyArray<ExportedNode> =>
  tree.map((node) =>
    Match.valueTags(node, {
      PinnedBookmark: pinOf,
      PinnedSplit: ({ items: [left, right] }): ExportedNode => ({
        type: "split",
        items: [pinOf(left), pinOf(right)],
      }),
      PinnedLiveFolder: (live): ExportedNode => ({
        type: "liveFolder",
        title: live.title,
        source: liveSourceOf(live.source),
        sort: sources.liveSorts.get(live.id) ?? DEFAULT_LIVE_SORT,
      }),
      PinnedFolder: (folder): ExportedNode => ({
        type: "folder",
        title: folder.title,
        icon: sources.folderIcons.get(folder.id) ?? null,
        children: nodesOf(folder.children, sources),
      }),
    }),
  )

const pinIdsIn = (tree: PinnedTree): ReadonlyArray<BookmarkId> =>
  tree.flatMap((node) =>
    Match.valueTags(node, {
      PinnedBookmark: ({ id }): ReadonlyArray<BookmarkId> => [id],
      PinnedSplit: ({ items }) => items.map((item) => item.id),
      PinnedLiveFolder: () => [],
      PinnedFolder: ({ children }) => pinIdsIn(children),
    }),
  )

// 同じピンに結びついたタブが複数あると、サイドパネルは 2 つ目以降を一時タブとして見せる。
// 書き出しではそれも含めない。ピンとして書くページを一時タブとしても書くと、読み込んだときに
// 同じページが二重に開く
const temporaryTabsOf = (
  space: Space,
  tree: PinnedTree,
  openTabs: ReadonlyArray<BrowserTab>,
  sources: ExportSources,
): ReadonlyArray<ExportedLink> => {
  const pinIds = new Set(pinIdsIn(tree))
  const spaceTabs = Array.getSomes(
    openTabs.map((tab) =>
      Option.filter(
        trackedTab(sources.workspace, tab.id),
        (tracked) =>
          !tab.pinned &&
          tracked.spaceId === space.id &&
          (tracked.pinned === null || !pinIds.has(tracked.pinned.bookmarkId)),
      ).pipe(
        Option.map((tracked) => ({
          windowId: tab.windowId,
          link: { title: tracked.titleOverride ?? pageTitleOf(tab), url: urlOf(tab) },
        })),
      ),
    ),
  )
  // 表示順はウィンドウごとのサイドパネルでの並びなので、全体をまとめて並べ替えると食い違う
  return Array.dedupe(spaceTabs.map(({ windowId }) => windowId)).flatMap((windowId) =>
    displayOrder(
      spaceTabs.filter((spaceTab) => spaceTab.windowId === windowId).map(({ link }) => link),
      { newestOnTop: sources.settings.newTabsOnTop },
    ),
  )
}

const settingsOf = (settings: Settings): LatestExport["settings"] => ({
  newTabsOnTop: settings.newTabsOnTop,
  showAllOpenTabsInCollapsedFolders: settings.showAllOpenTabsInCollapsedFolders,
  syncTabGroups: settings.syncTabGroups,
  autoArchive: {
    enabled: settings.autoArchive.enabled,
    idleMinutes: settings.autoArchive.idleMinutes,
  },
  defaultSpaceId: settings.defaultSpaceId,
  locale: settings.locale,
  pageShortcuts: {
    copyUrl: settings.pageShortcuts.copyUrl,
    copyMarkdownLink: settings.pageShortcuts.copyMarkdownLink,
  },
})

/**
 * Katip の状態を、最新の版の書き出しファイルの文書にする。
 *
 * @remarks
 * GitHub のトークン、ライブフォルダが取得した中身、フォルダの開閉、アーカイブ、復元のための記録は
 * 書き出さない。シークレットウィンドウのタブと、Katip 自身のページのタブも書き出さない。
 *
 * @returns ピン留めツリーを読めなかった Space があれば {@link PinnedTreeUnavailable}。
 *   一部の Space のピンが欠けたファイルを、欠けたと気付かれないまま残させない。
 */
export const buildExport = (
  sources: ExportSources,
): Result.Result<LatestExport, PinnedTreeUnavailable> => {
  const openTabs = Array.sort(
    sources.tabs.filter(
      (tab) =>
        // シークレットウィンドウで開いたページは、書き出したファイルに残すと閲覧の跡になる
        !tab.incognito &&
        // Katip 自身のページは Space に入れない決まりだが、Space のタブがそのページへ移ると
        // Space に残る。書き出すのは Space に入れるページだけにする
        !urlOf(tab).startsWith(sources.extensionOrigin),
    ),
    byWindowThenIndex,
  )
  return Result.map(
    Result.all(
      sources.spaces.map((space) =>
        Option.match(Option.fromNullishOr(sources.pinnedTrees.get(space.id)), {
          onNone: () => Result.fail(new PinnedTreeUnavailable({ spaceId: space.id })),
          onSome: (tree) =>
            Result.succeed<ExportedSpace>({
              id: space.id,
              name: space.name,
              theme: themeOf(space.theme),
              pinned: nodesOf(tree, sources),
              tabs: temporaryTabsOf(space, tree, openTabs, sources),
            }),
        }),
      ),
    ),
    (spaces): LatestExport => ({
      format: EXPORT_FORMAT,
      version: LATEST_EXPORT_VERSION,
      exportedAt: new Date(sources.exportedAt).toISOString(),
      generator: { name: "Katip", version: sources.katipVersion },
      spaces,
      // Favorites はウィンドウごとの固定タブで、同じページをウィンドウの数だけ持っていることが多い
      favorites: Array.dedupeWith(
        openTabs
          .filter((tab) => tab.pinned)
          .map((tab): ExportedLink => ({ title: pageTitleOf(tab), url: urlOf(tab) })),
        (a, b) => a.url === b.url,
      ),
      settings: settingsOf(sources.settings),
    }),
  )
}
