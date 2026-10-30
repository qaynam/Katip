import { Match, Option } from "effect"
import type { SpaceId } from "#modules/space"
import type { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { PinnedPlacement, SidebarCommand, TemporaryPlacement } from "#protocol"

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
      // 閉じたフォルダに覗かせているアイテムは、実際の親と位置がビューから分からないことがある
      readonly position: PinnedPosition | null
    }
  | {
      readonly _tag: "PinnedSplit"
      readonly bookmarkId: BookmarkId
      // 2 つのタブが分割ビューとして開いているときだけ値を持つ
      readonly openSplitViewId: SplitViewId | null
      readonly position: PinnedPosition
    }
  | { readonly _tag: "Favorite"; readonly tabId: TabId; readonly index: number }
  | { readonly _tag: "SpaceMark"; readonly spaceId: SpaceId; readonly index: number }

// slot は「現在の並び（ドラッグ中の要素を含む）の何番目の隙間か」。
// 移動先の最終位置への換算は commandForDrop だけが行う
export type DropTarget =
  | { readonly _tag: "Temporary"; readonly placement: TemporaryPlacement }
  | { readonly _tag: "SplitWith"; readonly tabId: TabId }
  | { readonly _tag: "Pinned"; readonly parentId: BookmarkId | null; readonly slot: number }
  | { readonly _tag: "Favorites"; readonly slot: number }
  | { readonly _tag: "SpaceBar"; readonly slot: number }

export interface DropContext {
  /** 表示中の Space。ピン留めや一時タブへの配置先になる */
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

// 分割ビューにできる行は、上下の 1/4 だけを前後への並べ替えに使い、中央を分割ビューに使う。
// 分割できない行まで中央を空けると、並べ替えの当たり判定が無駄に狭くなる
export const rowZoneAt = (offset: number, size: number, canSplitInCenter: boolean): RowZone => {
  if (!canSplitInCenter) return edgeAt(offset, size)
  const ratio = offset / size
  if (ratio < 0.25) return "before"
  if (ratio > 0.75) return "after"
  return "split"
}

export type FolderZone = "before" | "into" | "after" | "firstChild"

// 見出しの上下 1/4 だけを前後への挿入に使い、中央はフォルダの中へ入れる。
// 開いたフォルダの下端は、見た目上すぐ下にある先頭の子の前とみなす
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

// 同じ並びの中で後ろへ動かすときは、自分が抜けた分だけ挿入位置が前に詰まる
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

/** 1 つのタブとして動かせるドラッグ元なら、そのタブ。分割ビューの行は 1 つのタブではない */
const singleTabOf = (source: DragSource): Option.Option<TabId> =>
  Match.valueTags(source, {
    TemporaryTab: ({ tabId }) => Option.some(tabId),
    TemporarySplit: () => Option.none(),
    PinnedItem: ({ openTabId }) => Option.fromNullishOr(openTabId),
    PinnedSplit: () => Option.none(),
    Favorite: ({ tabId }) => Option.some(tabId),
    SpaceMark: () => Option.none(),
  })

const temporaryTabsOf = (source: DragSource): ReadonlyArray<TabId> =>
  Match.valueTags(source, {
    TemporaryTab: ({ tabId }) => [tabId],
    TemporarySplit: ({ tabIds }) => tabIds,
    PinnedItem: () => [],
    PinnedSplit: () => [],
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
    Favorite: ({ tabId }) => Option.some(placeTab(tabId)),
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
    TemporarySplit: ({ splitViewId }) =>
      Option.some<SidebarCommand>({
        _tag: "PlaceSplitInPinned",
        splitViewId,
        placement: placementAt(target.slot),
      }),
    TemporaryTab: ({ tabId }) => Option.some(placeTab(tabId)),
    Favorite: ({ tabId }) => Option.some(placeTab(tabId)),
    SpaceMark: () => Option.none(),
  })
}

const dropOnFavorites = (source: DragSource, slot: number): Option.Option<SidebarCommand> =>
  source._tag === "Favorite"
    ? reorder(source.index, slot, (toIndex) => ({
        _tag: "MoveFavorite",
        tabId: source.tabId,
        toIndex,
      }))
    : singleTabOf(source).pipe(
        Option.map((tabId) => ({ _tag: "AddToFavorites", tabId, index: slot })),
      )

const dropOnSpaceBar = (source: DragSource, slot: number): Option.Option<SidebarCommand> =>
  source._tag === "SpaceMark"
    ? reorder(source.index, slot, (toIndex) => ({
        _tag: "MoveSpace",
        spaceId: source.spaceId,
        toIndex,
      }))
    : Option.none()

/**
 * 結果が None のドロップは受け付けない（元の位置に落とした場合や、閉じたピンを一時タブへ
 * 落とした場合、分割ビューを作れない環境で分割しようとした場合など）。
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
