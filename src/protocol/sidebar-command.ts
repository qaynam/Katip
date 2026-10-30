import { Schema } from "effect"
import { ArchiveEntryId } from "#modules/archive"
import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"

// 一時タブの並びは表示順（新しいタブを上に出す設定なら逆順）で指定させる。
// UI に Chrome のタブ index への換算を持ち込むと、表示設定との組み合わせで取り違えるため
export const TemporaryPlacement = Schema.Union([
  Schema.TaggedStruct("Above", { tabId: TabId }),
  Schema.TaggedStruct("Below", { tabId: TabId }),
  Schema.TaggedStruct("Top", {}),
  Schema.TaggedStruct("Bottom", {}),
])
export type TemporaryPlacement = typeof TemporaryPlacement.Type

export const PinnedPlacement = Schema.Struct({
  spaceId: SpaceId,
  // null は Space 直下を表す
  parentId: Schema.NullOr(BookmarkId),
  // 移動・作成した後に親の中で占める位置。同じ親の中で後ろへ動かすなら、自分が抜けた分を詰めて数える
  index: Schema.Int,
})
export type PinnedPlacement = typeof PinnedPlacement.Type

export const SidebarCommand = Schema.Union([
  Schema.TaggedStruct("SwitchSpace", { windowId: WindowId, spaceId: SpaceId }),
  Schema.TaggedStruct("CreateSpace", {
    windowId: WindowId,
    name: Schema.optionalKey(SpaceName),
    theme: Schema.optionalKey(SpaceTheme),
  }),
  Schema.TaggedStruct("RenameSpace", { spaceId: SpaceId, name: SpaceName }),
  Schema.TaggedStruct("SetSpaceTheme", { spaceId: SpaceId, theme: SpaceTheme }),
  Schema.TaggedStruct("DeleteSpace", { spaceId: SpaceId }),
  Schema.TaggedStruct("MoveSpace", { spaceId: SpaceId, toIndex: Schema.Int }),

  Schema.TaggedStruct("OpenNewTab", { windowId: WindowId }),
  Schema.TaggedStruct("ActivateTab", { tabId: TabId }),
  Schema.TaggedStruct("CloseTab", { tabId: TabId }),
  // 空文字はタブ名の上書きを解除する
  Schema.TaggedStruct("RenameTab", { tabId: TabId, title: Schema.String }),
  Schema.TaggedStruct("MoveTabToSpace", { tabId: TabId, spaceId: SpaceId }),
  Schema.TaggedStruct("PlaceTabInTemporary", {
    tabId: TabId,
    spaceId: SpaceId,
    placement: TemporaryPlacement,
  }),
  Schema.TaggedStruct("PlaceTabInPinned", { tabId: TabId, placement: PinnedPlacement }),
  Schema.TaggedStruct("PinTab", { tabId: TabId }),
  Schema.TaggedStruct("UnpinTab", { tabId: TabId }),
  Schema.TaggedStruct("CloseTemporaryTabs", { windowId: WindowId, spaceId: SpaceId }),
  // tabId のタブを withTabId のタブの右に並べて分割ビューにする
  Schema.TaggedStruct("SplitTabs", { tabId: TabId, withTabId: TabId }),
  Schema.TaggedStruct("Unsplit", { splitViewId: SplitViewId }),
  Schema.TaggedStruct("PlaceSplitInTemporary", {
    splitViewId: SplitViewId,
    spaceId: SpaceId,
    placement: TemporaryPlacement,
  }),
  Schema.TaggedStruct("PlaceSplitInPinned", {
    splitViewId: SplitViewId,
    placement: PinnedPlacement,
  }),
  Schema.TaggedStruct("ArchiveTab", { tabId: TabId }),
  Schema.TaggedStruct("AddToFavorites", { tabId: TabId, index: Schema.optionalKey(Schema.Int) }),
  Schema.TaggedStruct("MoveFavorite", { tabId: TabId, toIndex: Schema.Int }),

  Schema.TaggedStruct("OpenPinnedItem", { windowId: WindowId, bookmarkId: BookmarkId }),
  Schema.TaggedStruct("MovePinnedItem", { bookmarkId: BookmarkId, placement: PinnedPlacement }),
  Schema.TaggedStruct("RemovePinnedItem", { bookmarkId: BookmarkId }),
  Schema.TaggedStruct("RenamePinnedItem", { bookmarkId: BookmarkId, title: Schema.String }),
  Schema.TaggedStruct("ResetPinnedTab", { tabId: TabId }),
  Schema.TaggedStruct("ReplacePinnedUrl", { tabId: TabId }),
  Schema.TaggedStruct("CreateFolder", {
    spaceId: SpaceId,
    parentId: Schema.NullOr(BookmarkId),
  }),
  Schema.TaggedStruct("SetFolderExpanded", { bookmarkId: BookmarkId, isExpanded: Schema.Boolean }),
  Schema.TaggedStruct("DeleteFolder", { bookmarkId: BookmarkId }),

  Schema.TaggedStruct("RestoreArchiveEntry", { windowId: WindowId, entryId: ArchiveEntryId }),
  Schema.TaggedStruct("RemoveArchiveEntry", { entryId: ArchiveEntryId }),
  Schema.TaggedStruct("UpdateAutoArchive", { enabled: Schema.Boolean, idleMinutes: IdleMinutes }),
  Schema.TaggedStruct("OpenSettings", {}),
])
export type SidebarCommand = typeof SidebarCommand.Type
