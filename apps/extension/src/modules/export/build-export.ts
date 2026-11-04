import { Array, Match, Option, Order, pipe, Result } from "effect"
import type { FavoriteList } from "#modules/favorites"
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
import { isNewTabPage, trackedTab, type Workspace } from "#modules/workspace"
import type { BookmarkId, BrowserTab } from "#platform/browser"
import { EXPORT_FORMAT, LATEST_EXPORT_VERSION, type LatestExport } from "./export-file"

type ExportedSpace = LatestExport["spaces"][number]
type ExportedNode = ExportedSpace["pinned"][number]
type ExportedLink = ExportedSpace["tabs"][number]
type ExportedPin = Extract<ExportedNode, { readonly type: "pin" }>
type ExportedLiveSource = Extract<ExportedNode, { readonly type: "liveFolder" }>["source"]

export interface ExportSources {
  /** In epoch milliseconds. */
  readonly exportedAt: number
  /** The version of the Katip doing the export. */
  readonly katipVersion: string
  /** In the form `chrome-extension://<id>/`. Tabs showing Katip's own pages aren't exported. */
  readonly extensionOrigin: string
  readonly spaces: SpaceList
  /** The pinned trees of the Spaces that could be read. Missing any Space fails the export. */
  readonly pinnedTrees: ReadonlyMap<SpaceId, PinnedTree>
  /** A folder missing here has no icon chosen. */
  readonly folderIcons: ReadonlyMap<BookmarkId, FolderIcon>
  /** A live folder missing here uses the default sort. */
  readonly liveSorts: ReadonlyMap<BookmarkId, LiveSort>
  readonly workspace: Workspace
  /** Every Favorite, open or closed, in order. */
  readonly favorites: FavoriteList
  /** The tabs of every window, in any order. */
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

// When several tabs are bound to the same pin, the side panel shows all but the first as temporary
// tabs. The export leaves those out too: a page written as a pin and also as a temporary tab would
// open twice on import
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
  // Not sorted as a whole: the display order is each window's side panel order, which a single
  // sort across windows would contradict
  return Array.dedupe(spaceTabs.map(({ windowId }) => windowId)).flatMap((windowId) =>
    displayOrder(
      spaceTabs.filter((spaceTab) => spaceTab.windowId === windowId).map(({ link }) => link),
      { newestOnTop: sources.settings.newTabsOnTop },
    ),
  )
}

/** Settings as the latest version of the export file writes them. */
export const exportedSettingsOf = (settings: Settings): LatestExport["settings"] => ({
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
 * Turns Katip's state into a document of the latest export file version.
 *
 * @remarks
 * The GitHub token, what live folders fetched, which folders are open, the archive and the records
 * for restoring tabs aren't exported. Neither are tabs in incognito windows, tabs showing Katip's
 * own pages, or blank new tabs.
 *
 * @returns {@link PinnedTreeUnavailable} when any Space's pinned tree couldn't be read, so that no
 *   file is left with some Spaces' pins missing without anyone noticing.
 */
export const buildExport = (
  sources: ExportSources,
): Result.Result<LatestExport, PinnedTreeUnavailable> => {
  const openTabs = Array.sort(
    sources.tabs.filter(
      (tab) =>
        // Pages opened in an incognito window would leave a browsing trail in the exported file
        !tab.incognito &&
        // Katip's own pages never join a Space, but a Space's tab that navigates to one stays in
        // the Space. Only pages that may join a Space are exported
        !urlOf(tab).startsWith(sources.extensionOrigin) &&
        // A blank new tab holds nothing worth keeping; importing it would only open an empty tab
        !isNewTabPage(urlOf(tab)),
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
      favorites: sources.favorites.map(({ title, url }): ExportedLink => ({ title, url })),
      settings: exportedSettingsOf(sources.settings),
    }),
  )
}
