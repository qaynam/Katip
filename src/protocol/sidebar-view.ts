import { Schema } from "effect"
import { ArchiveEntry } from "#modules/archive"
import { IdleMinutes } from "#modules/settings"
import { SpaceColor, SpaceId, SpaceName } from "#modules/space"
import { BookmarkId, TabId, WindowId } from "#platform/browser"

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
})
export type TabView = typeof TabView.Type

export const OpenPinnedTab = Schema.Struct({
  tab: TabView,
  // ピン留めした URL から別のページへ移動したかどうか。クエリやハッシュだけの違いは移動とみなさない
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

export interface PinnedFolderView {
  readonly _tag: "PinnedFolder"
  readonly bookmarkId: BookmarkId
  readonly title: string
  readonly isExpanded: boolean
  readonly canCreateSubfolder: boolean
  readonly children: ReadonlyArray<PinnedNodeView>
  readonly peekedItems: ReadonlyArray<PinnedItemView>
}

interface PinnedFolderViewEncoded {
  readonly _tag: "PinnedFolder"
  readonly bookmarkId: string
  readonly title: string
  readonly isExpanded: boolean
  readonly canCreateSubfolder: boolean
  readonly children: ReadonlyArray<PinnedNodeViewEncoded>
  readonly peekedItems: ReadonlyArray<typeof PinnedItemView.Encoded>
}

export type PinnedNodeView = PinnedItemView | PinnedFolderView
type PinnedNodeViewEncoded = typeof PinnedItemView.Encoded | PinnedFolderViewEncoded

export const PinnedFolderView = Schema.TaggedStruct("PinnedFolder", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  isExpanded: Schema.Boolean,
  canCreateSubfolder: Schema.Boolean,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<PinnedNodeView, PinnedNodeViewEncoded> => PinnedNodeView),
  ),
  // 閉じたフォルダの見出しの下に覗かせて表示するアイテム
  peekedItems: Schema.Array(PinnedItemView),
})

export const PinnedNodeView = Schema.Union([PinnedItemView, PinnedFolderView])

export const SpaceView = Schema.Struct({
  id: SpaceId,
  name: SpaceName,
  color: SpaceColor,
  // ブックマークが読めない間は、ピン留めが空なのか未取得なのかを区別して表示する
  pinned: Schema.Union([
    Schema.TaggedStruct("Available", {
      nodes: Schema.Array(PinnedNodeView),
      canCreateFolder: Schema.Boolean,
    }),
    Schema.TaggedStruct("Unavailable", {}),
  ]),
  temporaryTabs: Schema.Array(TabView),
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
})
export type SidebarView = typeof SidebarView.Type
