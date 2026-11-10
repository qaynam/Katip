import { Schema } from "effect"
import { ArchiveEntryId } from "#modules/archive"
import { FavoriteId } from "#modules/favorites"
import { LiveSort, LiveSource } from "#modules/live-folders"
import { FolderIcon } from "#modules/pinned"
import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { SpaceTheme } from "#modules/theme"
import { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"

// In display order (reversed when new tabs show at the top), not Chrome's tab index: converting to
// the index in the UI gets mixed up with that display setting
export const TemporaryPlacement = Schema.Union([
  Schema.TaggedStruct("Above", { tabId: TabId }),
  Schema.TaggedStruct("Below", { tabId: TabId }),
  Schema.TaggedStruct("Top", {}),
  Schema.TaggedStruct("Bottom", {}),
])
export type TemporaryPlacement = typeof TemporaryPlacement.Type

export const PinnedPlacement = Schema.Struct({
  spaceId: SpaceId,
  // null is the top level of the Space
  parentId: Schema.NullOr(BookmarkId),
  // The position in the parent once moved or created. Moving later within the same parent counts
  // as if the item had already been taken out
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
  // The state to set rather than a toggle, so a press made on a view that is behind does what it
  // showed
  Schema.TaggedStruct("SetTabMuted", { tabId: TabId, muted: Schema.Boolean }),
  // An empty title clears the tab's custom name
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
  // Puts tabId to the right of withTabId in a split view
  Schema.TaggedStruct("SplitTabs", { tabId: TabId, withTabId: TabId }),
  // A tab let go over the page, outside the side panel. In screen coordinates, with the side
  // panel's left and right edges
  Schema.TaggedStruct("SplitWithShownTab", {
    tabId: TabId,
    windowId: WindowId,
    x: Schema.Number,
    y: Schema.Number,
    panelLeft: Schema.Number,
    panelRight: Schema.Number,
  }),
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
  // index is the place among the Favorites, closed ones included
  Schema.TaggedStruct("AddToFavorites", { tabId: TabId, index: Schema.optionalKey(Schema.Int) }),
  Schema.TaggedStruct("MoveFavorite", { favoriteId: FavoriteId, toIndex: Schema.Int }),
  Schema.TaggedStruct("OpenFavorite", { windowId: WindowId, favoriteId: FavoriteId }),
  Schema.TaggedStruct("RemoveFavorite", { favoriteId: FavoriteId }),

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
  // null goes back to the folder glyph
  Schema.TaggedStruct("SetFolderIcon", { bookmarkId: BookmarkId, icon: Schema.NullOr(FolderIcon) }),
  Schema.TaggedStruct("DeleteFolder", { bookmarkId: BookmarkId }),

  Schema.TaggedStruct("RestoreArchiveEntry", { windowId: WindowId, entryId: ArchiveEntryId }),
  Schema.TaggedStruct("RemoveArchiveEntry", { entryId: ArchiveEntryId }),
  Schema.TaggedStruct("UpdateAutoArchive", { enabled: Schema.Boolean, idleMinutes: IdleMinutes }),
  Schema.TaggedStruct("OpenSettings", {}),

  // The outcome's createdBookmarkId is the ID of the bookmark folder that holds the live folder
  Schema.TaggedStruct("CreateLiveFolder", {
    spaceId: SpaceId,
    parentId: Schema.NullOr(BookmarkId),
    source: LiveSource,
  }),
  Schema.TaggedStruct("RefreshLiveFolder", { bookmarkId: BookmarkId }),
  Schema.TaggedStruct("OpenLiveItem", {
    windowId: WindowId,
    bookmarkId: BookmarkId,
    itemId: Schema.String,
  }),
  Schema.TaggedStruct("MarkLiveFolderSeen", { bookmarkId: BookmarkId }),
  Schema.TaggedStruct("SetLiveFolderSort", { bookmarkId: BookmarkId, sort: LiveSort }),
  // Opens a page that is neither a pin nor a live item, such as a source's sign-in page, as a
  // temporary tab in the window's active Space
  Schema.TaggedStruct("OpenUrl", { windowId: WindowId, url: Schema.String }),
  // An empty token deletes it. Only the background holds the token; it never goes into the view
  Schema.TaggedStruct("SetGitHubToken", { token: Schema.String }),

  Schema.TaggedStruct("OpenSpotlight", { windowId: WindowId }),
])
export type SidebarCommand = typeof SidebarCommand.Type
