import { Schema } from "effect"
import { ArchiveEntry } from "#modules/archive"
import { LiveItem, LiveSort, LiveSource } from "#modules/live-folders"
import { FolderIcon } from "#modules/pinned"
import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"

export const TabView = Schema.Struct({
  tabId: TabId,
  title: Schema.String,
  url: Schema.String,
  favIconUrl: Schema.NullOr(Schema.String),
  isActive: Schema.Boolean,
  isLoading: Schema.Boolean,
  isAudible: Schema.Boolean,
  isMuted: Schema.Boolean,
  isDiscarded: Schema.Boolean,
  // Set only while Chrome shows the tab beside another one in a split view
  splitViewId: Schema.NullOr(SplitViewId),
})
export type TabView = typeof TabView.Type

export const OpenPinnedTab = Schema.Struct({
  tab: TabView,
  // Whether the tab has left the pinned URL for another page. A different query or hash alone
  // doesn't count
  hasNavigatedAway: Schema.Boolean,
})
export type OpenPinnedTab = typeof OpenPinnedTab.Type

export const PinnedItemView = Schema.TaggedStruct("PinnedItem", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  url: Schema.String,
  openTab: Schema.NullOr(OpenPinnedTab),
})
export type PinnedItemView = typeof PinnedItemView.Type

/**
 * Two tabs pinned as a split view. Stored as a bookmark folder holding two bookmarks, and opened
 * side by side in a split view. Ordered left, then right.
 */
export const PinnedSplitView = Schema.TaggedStruct("PinnedSplit", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  items: Schema.Tuple([PinnedItemView, PinnedItemView]),
})
export type PinnedSplitView = typeof PinnedSplitView.Type

export const LiveItemView = Schema.Struct({
  ...LiveItem.fields,
  /** Not opened yet: unread in Gmail, updated since last seen on GitHub. */
  isUnseen: Schema.Boolean,
})
export type LiveItemView = typeof LiveItemView.Type

export const LiveFolderStatus = Schema.TaggedUnion({
  Ready: { refreshedAt: Schema.Number },
  Refreshing: {},
  Failed: {
    reason: Schema.String,
    // Access to the source isn't granted yet. Asking for it from the UI fixes this
    needsPermission: Schema.Boolean,
    // The GitHub token is missing or invalid. Entering a token again from the UI fixes this
    needsToken: Schema.Boolean,
    // Not signed in to the source. Opening this page and signing in fixes this
    signInUrl: Schema.NullOr(Schema.String),
  },
})
export type LiveFolderStatus = typeof LiveFolderStatus.Type

/**
 * A folder that fills itself from a source. A bookmark folder gives it its place and name, and it
 * lists the fetched items instead of bookmarks.
 */
export const PinnedLiveFolderView = Schema.TaggedStruct("PinnedLiveFolder", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  source: LiveSource,
  isExpanded: Schema.Boolean,
  status: LiveFolderStatus,
  sort: LiveSort,
  // Already in the order of sort
  items: Schema.Array(LiveItemView),
})
export type PinnedLiveFolderView = typeof PinnedLiveFolderView.Type

export interface PinnedFolderView {
  readonly _tag: "PinnedFolder"
  readonly bookmarkId: BookmarkId
  readonly title: string
  readonly icon: FolderIcon | null
  readonly isExpanded: boolean
  readonly canCreateSubfolder: boolean
  readonly children: ReadonlyArray<PinnedNodeView>
  readonly peekedItems: ReadonlyArray<PinnedItemView | PinnedSplitView>
}

interface PinnedFolderViewEncoded {
  readonly _tag: "PinnedFolder"
  readonly bookmarkId: string
  readonly title: string
  readonly icon: FolderIcon | null
  readonly isExpanded: boolean
  readonly canCreateSubfolder: boolean
  readonly children: ReadonlyArray<PinnedNodeViewEncoded>
  readonly peekedItems: ReadonlyArray<
    typeof PinnedItemView.Encoded | typeof PinnedSplitView.Encoded
  >
}

export type PinnedNodeView =
  PinnedItemView | PinnedSplitView | PinnedLiveFolderView | PinnedFolderView
type PinnedNodeViewEncoded =
  | typeof PinnedItemView.Encoded
  | typeof PinnedSplitView.Encoded
  | typeof PinnedLiveFolderView.Encoded
  | PinnedFolderViewEncoded

export const PinnedFolderView = Schema.TaggedStruct("PinnedFolder", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  // null means no icon was chosen, and the folder glyph shows
  icon: Schema.NullOr(FolderIcon),
  isExpanded: Schema.Boolean,
  canCreateSubfolder: Schema.Boolean,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<PinnedNodeView, PinnedNodeViewEncoded> => PinnedNodeView),
  ),
  // Items that peek out under a collapsed folder's heading. A split pin shows both tabs on one row
  peekedItems: Schema.Array(Schema.Union([PinnedItemView, PinnedSplitView])),
})

export const PinnedNodeView = Schema.Union([
  PinnedItemView,
  PinnedSplitView,
  PinnedLiveFolderView,
  PinnedFolderView,
])

/** One row of the temporary tabs. A split view's two tabs share one row, left then right. */
export const TemporaryEntry = Schema.Union([
  Schema.TaggedStruct("TemporaryTab", { tab: TabView }),
  Schema.TaggedStruct("TemporarySplit", {
    splitViewId: SplitViewId,
    tabs: Schema.Tuple([TabView, TabView]),
  }),
])
export type TemporaryEntry = typeof TemporaryEntry.Type

export const SpaceView = Schema.Struct({
  id: SpaceId,
  name: SpaceName,
  theme: SpaceTheme,
  // Unavailable while bookmarks can't be read, so that pins not read yet don't look like no pins
  pinned: Schema.Union([
    Schema.TaggedStruct("Available", {
      nodes: Schema.Array(PinnedNodeView),
      canCreateFolder: Schema.Boolean,
    }),
    Schema.TaggedStruct("Unavailable", {}),
  ]),
  temporaryEntries: Schema.Array(TemporaryEntry),
})
export type SpaceView = typeof SpaceView.Type

export const FavoriteView = Schema.Struct({
  tabId: TabId,
  title: Schema.String,
  url: Schema.String,
  favIconUrl: Schema.NullOr(Schema.String),
  isActive: Schema.Boolean,
})
export type FavoriteView = typeof FavoriteView.Type

export const SidebarView = Schema.Struct({
  windowId: WindowId,
  activeSpaceId: SpaceId,
  spaces: Schema.Array(SpaceView),
  favorites: Schema.Array(FavoriteView),
  archive: Schema.Array(ArchiveEntry),
  autoArchive: Schema.Struct({ enabled: Schema.Boolean, idleMinutes: IdleMinutes }),
  // Chrome before 155 has no API to create split views, so the split actions are hidden
  canSplit: Schema.Boolean,
  // The key assigned to open Spotlight, as the browser writes it (such as ⌥T); null when unassigned
  spotlightShortcut: Schema.NullOr(Schema.String),
})
export type SidebarView = typeof SidebarView.Type
