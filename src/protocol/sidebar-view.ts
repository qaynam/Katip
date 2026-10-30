import { Schema } from "effect"
import { ArchiveEntry } from "#modules/archive"
import { LiveItem, LiveSource } from "#modules/live-folders"
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
  // Chrome の分割ビューで、別のタブと並べて表示しているときだけ値を持つ
  splitViewId: Schema.NullOr(SplitViewId),
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

/**
 * 分割ビューとしてピン留めした 2 つのタブ。ブックマークでは 2 つのブックマークを入れたフォルダとして
 * 保存し、開くと分割ビューで並べる。並びは左、右の順。
 */
export const PinnedSplitView = Schema.TaggedStruct("PinnedSplit", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  items: Schema.Tuple([PinnedItemView, PinnedItemView]),
})
export type PinnedSplitView = typeof PinnedSplitView.Type

export const LiveItemView = Schema.Struct({
  ...LiveItem.fields,
  /** まだ開いていない（Gmail なら未読、GitHub なら前回見た後に更新された）もの。 */
  isUnseen: Schema.Boolean,
})
export type LiveItemView = typeof LiveItemView.Type

export const LiveFolderStatus = Schema.TaggedUnion({
  Ready: { refreshedAt: Schema.Number },
  Refreshing: {},
  Failed: {
    reason: Schema.String,
    // 取得元へのアクセスがまだ許可されていない。UI から許可を求めれば直る
    needsPermission: Schema.Boolean,
    // GitHub のトークンが無いか無効。UI からトークンを入れ直せば直る
    needsToken: Schema.Boolean,
  },
})
export type LiveFolderStatus = typeof LiveFolderStatus.Type

/**
 * 取得元から中身を自動で取り込むフォルダ。ブックマークのフォルダを置き場所と名前に使い、
 * 中身はブックマークではなく取得した項目を並べる。
 */
export const PinnedLiveFolderView = Schema.TaggedStruct("PinnedLiveFolder", {
  bookmarkId: BookmarkId,
  title: Schema.String,
  source: LiveSource,
  isExpanded: Schema.Boolean,
  status: LiveFolderStatus,
  items: Schema.Array(LiveItemView),
})
export type PinnedLiveFolderView = typeof PinnedLiveFolderView.Type

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
  isExpanded: Schema.Boolean,
  canCreateSubfolder: Schema.Boolean,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<PinnedNodeView, PinnedNodeViewEncoded> => PinnedNodeView),
  ),
  // 閉じたフォルダの見出しの下に覗かせて表示するアイテム
  peekedItems: Schema.Array(PinnedItemView),
})

export const PinnedNodeView = Schema.Union([
  PinnedItemView,
  PinnedSplitView,
  PinnedLiveFolderView,
  PinnedFolderView,
])

/** 一時タブの一覧の 1 行。分割ビューの 2 つのタブは 1 行にまとめ、左、右の順に並べる。 */
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
  // ブックマークが読めない間は、ピン留めが空なのか未取得なのかを区別して表示する
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
  // Chrome 155 より前には分割ビューを作る API が無いので、分割の操作を出さない
  canSplit: Schema.Boolean,
})
export type SidebarView = typeof SidebarView.Type
