import { Match, Option } from "effect"
import type { FavoriteId } from "#modules/favorites"
import type { SpaceId } from "#modules/space"
import type { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"
import type { PinnedPlacement, SidebarCommand, TemporaryPlacement } from "#protocol"
import type { Point, Size } from "./menu-position"

export interface PinnedPosition {
  readonly parentId: BookmarkId | null
  readonly index: number
}

export type DragSource =
  | { readonly _tag: "TemporaryTab"; readonly tabId: TabId }
  | {
      readonly _tag: "TemporarySplit"
      readonly splitViewId: SplitViewId
      readonly tabIds: readonly [TabId, TabId]
    }
  | {
      readonly _tag: "PinnedItem"
      readonly bookmarkId: BookmarkId
      readonly openTabId: TabId | null
      // For items peeked from a collapsed folder, the view may not tell the actual parent and
      // position
      readonly position: PinnedPosition | null
    }
  | {
      readonly _tag: "PinnedSplit"
      readonly bookmarkId: BookmarkId
      // Set only while both tabs are open as a split view
      readonly openSplitViewId: SplitViewId | null
      // Like a peeked item, a peeked split pin may not tell its actual parent and position
      readonly position: PinnedPosition | null
    }
  // Regular and live folders move the same way, as bookmark folders
  | {
      readonly _tag: "PinnedFolder"
      readonly bookmarkId: BookmarkId
      readonly position: PinnedPosition
      /** The folder itself and every folder inside it. It can't be dropped into any of them. */
      readonly selfAndDescendantIds: ReadonlyArray<BookmarkId>
    }
  | {
      readonly _tag: "Favorite"
      // null for a pinned tab that isn't a Favorite's yet
      readonly favoriteId: FavoriteId | null
      // null while the Favorite is closed in this window
      readonly openTabId: TabId | null
      readonly index: number
    }
  | { readonly _tag: "SpaceMark"; readonly spaceId: SpaceId; readonly index: number }

// slot is the index of a gap in the current list, which still includes the dragged item.
// Only commandForDrop converts it into the final destination index
export type DropTarget =
  | { readonly _tag: "Temporary"; readonly placement: TemporaryPlacement }
  | { readonly _tag: "SplitWith"; readonly tabId: TabId }
  | { readonly _tag: "Pinned"; readonly parentId: BookmarkId | null; readonly slot: number }
  | { readonly _tag: "Favorites"; readonly slot: number }
  | { readonly _tag: "SpaceBar"; readonly slot: number }

export interface DropContext {
  /** The Space on screen. Drops into pinned or temporary tabs land in it. */
  readonly spaceId: SpaceId
  readonly canSplit: boolean
}

export type Edge = "before" | "after"

export const edgeAt = (offset: number, size: number): Edge =>
  offset < size / 2 ? "before" : "after"

export const slotAt = (index: number, edge: Edge): number => (edge === "before" ? index : index + 1)

export const temporaryPlacementAt = (tabId: TabId, edge: Edge): TemporaryPlacement =>
  edge === "before" ? { _tag: "Above", tabId } : { _tag: "Below", tabId }

export type RowZone = Edge | "split"

// On rows that can be split, the vertical middle band minus its left part (the right side of
// the row) creates a split view. The dropped tab goes on the right, so moving right is what
// splits. The left part and the top and bottom edges stay for reordering, so dragging straight
// up or down from where the row was grabbed never turns into a split. Rows that can't be
// split don't reserve the band, which would only shrink their reorder hit area
export const rowZoneAt = (offset: Point, size: Size, canSplit: boolean): RowZone => {
  const vertical = edgeAt(offset.y, size.height)
  if (!canSplit) return vertical
  const verticalRatio = offset.y / size.height
  const isInMiddleBand = verticalRatio >= 0.2 && verticalRatio <= 0.8
  const isTowardRight = offset.x >= size.width * 0.35
  return isInMiddleBand && isTowardRight ? "split" : vertical
}

export type FolderZone = "before" | "into" | "after" | "firstChild"

// Only the top and bottom quarters of the header insert before or after the folder; the
// middle drops into it. The bottom of an expanded folder counts as before its first child,
// which is what sits right below it on screen
export const folderZoneAt = (offset: number, size: number, isExpanded: boolean): FolderZone => {
  const ratio = offset / size
  if (ratio < 0.25) return "before"
  if (ratio > 0.75) return isExpanded ? "firstChild" : "after"
  return "into"
}

export interface FolderDropContext {
  readonly bookmarkId: BookmarkId
  readonly position: PinnedPosition
  readonly childCount: number
}

export const folderDropTarget = (folder: FolderDropContext, zone: FolderZone): DropTarget =>
  Match.value(zone).pipe(
    Match.when("before", () => pinnedSlot(folder.position.parentId, folder.position.index)),
    Match.when("after", () => pinnedSlot(folder.position.parentId, folder.position.index + 1)),
    Match.when("firstChild", () => pinnedSlot(folder.bookmarkId, 0)),
    Match.when("into", () => pinnedSlot(folder.bookmarkId, folder.childCount)),
    Match.exhaustive,
  )

const pinnedSlot = (parentId: BookmarkId | null, slot: number): DropTarget => ({
  _tag: "Pinned",
  parentId,
  slot,
})

// Moving an item later in the same list shifts the insertion index down by one, because the
// item has left its old place
const finalIndexWithin = (fromIndex: number, slot: number): number =>
  slot > fromIndex ? slot - 1 : slot

const reorder = (
  fromIndex: number,
  slot: number,
  toCommand: (toIndex: number) => SidebarCommand,
): Option.Option<SidebarCommand> => {
  const toIndex = finalIndexWithin(fromIndex, slot)
  return toIndex === fromIndex ? Option.none() : Option.some(toCommand(toIndex))
}

const isPlacementRelativeTo = (placement: TemporaryPlacement, tabId: TabId): boolean =>
  (placement._tag === "Above" || placement._tag === "Below") && placement.tabId === tabId

/** The tab, if the drag source moves as a single tab. A split view row is not a single tab. */
const singleTabOf = (source: DragSource): Option.Option<TabId> =>
  Match.valueTags(source, {
    TemporaryTab: ({ tabId }) => Option.some(tabId),
    TemporarySplit: () => Option.none(),
    PinnedItem: ({ openTabId }) => Option.fromNullishOr(openTabId),
    PinnedSplit: () => Option.none(),
    PinnedFolder: () => Option.none(),
    Favorite: ({ openTabId }) => Option.fromNullishOr(openTabId),
    SpaceMark: () => Option.none(),
  })

const temporaryTabsOf = (source: DragSource): ReadonlyArray<TabId> =>
  Match.valueTags(source, {
    TemporaryTab: ({ tabId }) => [tabId],
    TemporarySplit: ({ tabIds }) => tabIds,
    PinnedItem: () => [],
    PinnedSplit: () => [],
    PinnedFolder: () => [],
    Favorite: () => [],
    SpaceMark: () => [],
  })

const dropOnTemporary = (
  source: DragSource,
  placement: TemporaryPlacement,
  spaceId: SpaceId,
): Option.Option<SidebarCommand> => {
  const isNextToItself = temporaryTabsOf(source).some((tabId) =>
    isPlacementRelativeTo(placement, tabId),
  )
  if (isNextToItself) return Option.none()
  const placeTab = (tabId: TabId): SidebarCommand => ({
    _tag: "PlaceTabInTemporary",
    tabId,
    spaceId,
    placement,
  })
  const placeSplit = (splitViewId: SplitViewId): SidebarCommand => ({
    _tag: "PlaceSplitInTemporary",
    splitViewId,
    spaceId,
    placement,
  })
  return Match.valueTags(source, {
    TemporarySplit: ({ splitViewId }) => Option.some(placeSplit(splitViewId)),
    PinnedSplit: ({ openSplitViewId }) =>
      Option.fromNullishOr(openSplitViewId).pipe(Option.map(placeSplit)),
    TemporaryTab: ({ tabId }) => Option.some(placeTab(tabId)),
    PinnedItem: ({ openTabId }) => Option.fromNullishOr(openTabId).pipe(Option.map(placeTab)),
    PinnedFolder: () => Option.none(),
    Favorite: ({ openTabId }) => Option.fromNullishOr(openTabId).pipe(Option.map(placeTab)),
    SpaceMark: () => Option.none(),
  })
}

const dropOnSplit = (
  source: DragSource,
  withTabId: TabId,
  canSplit: boolean,
): Option.Option<SidebarCommand> =>
  singleTabOf(source).pipe(
    Option.filter((tabId) => canSplit && tabId !== withTabId),
    Option.map((tabId) => ({ _tag: "SplitTabs", tabId, withTabId })),
  )

const dropOnPinned = (
  source: DragSource,
  target: { readonly parentId: BookmarkId | null; readonly slot: number },
  spaceId: SpaceId,
): Option.Option<SidebarCommand> => {
  const placementAt = (index: number): PinnedPlacement => ({
    spaceId,
    parentId: target.parentId,
    index,
  })
  const movePinned = (bookmarkId: BookmarkId, position: PinnedPosition | null) =>
    position !== null && position.parentId === target.parentId
      ? reorder(position.index, target.slot, (index) => ({
          _tag: "MovePinnedItem",
          bookmarkId,
          placement: placementAt(index),
        }))
      : Option.some<SidebarCommand>({
          _tag: "MovePinnedItem",
          bookmarkId,
          placement: placementAt(target.slot),
        })
  const placeTab = (tabId: TabId): SidebarCommand => ({
    _tag: "PlaceTabInPinned",
    tabId,
    placement: placementAt(target.slot),
  })
  return Match.valueTags(source, {
    PinnedItem: ({ bookmarkId, position }) => movePinned(bookmarkId, position),
    PinnedSplit: ({ bookmarkId, position }) => movePinned(bookmarkId, position),
    PinnedFolder: ({ bookmarkId, position, selfAndDescendantIds }) =>
      target.parentId !== null && selfAndDescendantIds.includes(target.parentId)
        ? Option.none()
        : movePinned(bookmarkId, position),
    TemporarySplit: ({ splitViewId }) =>
      Option.some<SidebarCommand>({
        _tag: "PlaceSplitInPinned",
        splitViewId,
        placement: placementAt(target.slot),
      }),
    TemporaryTab: ({ tabId }) => Option.some(placeTab(tabId)),
    Favorite: ({ openTabId }) => Option.fromNullishOr(openTabId).pipe(Option.map(placeTab)),
    SpaceMark: () => Option.none(),
  })
}

const dropOnFavorites = (source: DragSource, slot: number): Option.Option<SidebarCommand> => {
  if (source._tag === "Favorite" && source.favoriteId !== null) {
    const { favoriteId } = source
    return reorder(source.index, slot, (toIndex) => ({ _tag: "MoveFavorite", favoriteId, toIndex }))
  }
  return singleTabOf(source).pipe(
    Option.map((tabId) => ({ _tag: "AddToFavorites", tabId, index: slot })),
  )
}

const dropOnSpaceBar = (source: DragSource, slot: number): Option.Option<SidebarCommand> =>
  source._tag === "SpaceMark"
    ? reorder(source.index, slot, (toIndex) => ({
        _tag: "MoveSpace",
        spaceId: source.spaceId,
        toIndex,
      }))
    : Option.none()

/**
 * A drop whose result is None is not accepted (e.g. dropping in the original place, dropping a
 * closed pin into temporary tabs, or splitting where split views aren't available).
 */
export const commandForDrop = (
  source: DragSource,
  target: DropTarget,
  context: DropContext,
): Option.Option<SidebarCommand> =>
  Match.valueTags(target, {
    Temporary: ({ placement }) => dropOnTemporary(source, placement, context.spaceId),
    SplitWith: ({ tabId }) => dropOnSplit(source, tabId, context.canSplit),
    Pinned: (pinned) => dropOnPinned(source, pinned, context.spaceId),
    Favorites: ({ slot }) => dropOnFavorites(source, slot),
    SpaceBar: ({ slot }) => dropOnSpaceBar(source, slot),
  })

export type DropOutcome =
  | { readonly _tag: "Run"; readonly command: SidebarCommand }
  // A drop that would split where split views are supported. Treating it as a reorder would
  // surprise someone who meant to split, so it reports the lack of support instead
  | { readonly _tag: "SplitUnsupported" }

/** A drop whose result is None is not accepted. */
export const dropOutcome = (
  source: DragSource,
  target: DropTarget,
  context: DropContext,
): Option.Option<DropOutcome> =>
  commandForDrop(source, target, context).pipe(
    Option.map((command): DropOutcome => ({ _tag: "Run", command })),
    Option.orElse(() =>
      target._tag === "SplitWith" &&
      !context.canSplit &&
      Option.isSome(dropOnSplit(source, target.tabId, true))
        ? Option.some<DropOutcome>({ _tag: "SplitUnsupported" })
        : Option.none(),
    ),
  )

/** How a drag ended, as its `dragend` event tells. */
export interface DragEnd {
  /** The pointer on screen. */
  readonly at: Point
  /** `none` when nothing took the drop. */
  readonly dropEffect: string
}

/** Where the side panel is on screen. */
export interface PanelBounds {
  readonly origin: Point
  readonly size: Size
}

/** The one open tab a drag carries, if it carries exactly one. */
export const openTabOf = (source: DragSource): TabId | null => {
  switch (source._tag) {
    case "TemporaryTab":
      return source.tabId
    case "PinnedItem":
    case "Favorite":
      return source.openTabId
    default:
      return null
  }
}

const isInside = (point: Point, panel: PanelBounds) =>
  point.x >= panel.origin.x &&
  point.x <= panel.origin.x + panel.size.width &&
  point.y >= panel.origin.y &&
  point.y <= panel.origin.y + panel.size.height

/**
 * The command for an open tab let go outside the side panel, where nothing took the drop: the
 * background splits it with the shown tab when it was let go over the page's left or right side.
 */
export const commandForPageDrop = (
  source: DragSource,
  end: DragEnd,
  panel: PanelBounds,
  windowId: WindowId,
): Option.Option<SidebarCommand> => {
  const tabId = openTabOf(source)
  return tabId === null || end.dropEffect !== "none" || isInside(end.at, panel)
    ? Option.none()
    : Option.some({
        _tag: "SplitWithShownTab",
        tabId,
        windowId,
        x: end.at.x,
        y: end.at.y,
        panelLeft: panel.origin.x,
        panelRight: panel.origin.x + panel.size.width,
      })
}
