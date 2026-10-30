import { Match, Option } from "effect"
import type { SpaceId } from "#modules/space"
import type { BookmarkId, TabId } from "#platform/browser"
import type { SidebarCommand, TemporaryPlacement } from "#protocol"

export interface PinnedPosition {
  readonly parentId: BookmarkId | null
  readonly index: number
}

export type DragSource =
  | { readonly _tag: "TemporaryTab"; readonly tabId: TabId }
  | {
      readonly _tag: "PinnedItem"
      readonly bookmarkId: BookmarkId
      readonly openTabId: TabId | null
      // 閉じたフォルダに覗かせているアイテムは、実際の親と位置がビューから分からないことがある
      readonly position: PinnedPosition | null
    }
  | { readonly _tag: "Favorite"; readonly tabId: TabId; readonly index: number }
  | { readonly _tag: "SpaceChip"; readonly spaceId: SpaceId; readonly index: number }

// slot は「現在の並び（ドラッグ中の要素を含む）の何番目の隙間か」。
// 移動先の最終位置への換算は commandForDrop だけが行う
export type DropTarget =
  | { readonly _tag: "Temporary"; readonly placement: TemporaryPlacement }
  | { readonly _tag: "Pinned"; readonly parentId: BookmarkId | null; readonly slot: number }
  | { readonly _tag: "Favorites"; readonly slot: number }
  | { readonly _tag: "Switcher"; readonly slot: number }

export type Edge = "before" | "after"

export const edgeAt = (offset: number, size: number): Edge =>
  offset < size / 2 ? "before" : "after"

export const slotAt = (index: number, edge: Edge): number => (edge === "before" ? index : index + 1)

export const temporaryPlacementAt = (tabId: TabId, edge: Edge): TemporaryPlacement =>
  edge === "before" ? { _tag: "Above", tabId } : { _tag: "Below", tabId }

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

const openTabOf = (source: DragSource): Option.Option<TabId> =>
  Match.valueTags(source, {
    TemporaryTab: ({ tabId }) => Option.some(tabId),
    PinnedItem: ({ openTabId }) => Option.fromNullishOr(openTabId),
    Favorite: ({ tabId }) => Option.some(tabId),
    SpaceChip: () => Option.none(),
  })

const dropOnTemporary = (
  source: DragSource,
  placement: TemporaryPlacement,
  spaceId: SpaceId,
): Option.Option<SidebarCommand> =>
  openTabOf(source).pipe(
    Option.filter((tabId) => !isPlacementRelativeTo(placement, tabId)),
    Option.map((tabId) => ({ _tag: "PlaceTabInTemporary", tabId, spaceId, placement })),
  )

const dropOnPinned = (
  source: DragSource,
  target: { readonly parentId: BookmarkId | null; readonly slot: number },
  spaceId: SpaceId,
): Option.Option<SidebarCommand> => {
  const placementAt = (index: number) => ({ spaceId, parentId: target.parentId, index })
  if (source._tag === "PinnedItem") {
    const { bookmarkId, position } = source
    return position !== null && position.parentId === target.parentId
      ? reorder(position.index, target.slot, (index) => ({
          _tag: "MovePinnedItem",
          bookmarkId,
          placement: placementAt(index),
        }))
      : Option.some({ _tag: "MovePinnedItem", bookmarkId, placement: placementAt(target.slot) })
  }
  return openTabOf(source).pipe(
    Option.map((tabId) => ({
      _tag: "PlaceTabInPinned",
      tabId,
      placement: placementAt(target.slot),
    })),
  )
}

const dropOnFavorites = (source: DragSource, slot: number): Option.Option<SidebarCommand> =>
  source._tag === "Favorite"
    ? reorder(source.index, slot, (toIndex) => ({
        _tag: "MoveFavorite",
        tabId: source.tabId,
        toIndex,
      }))
    : openTabOf(source).pipe(
        Option.map((tabId) => ({ _tag: "AddToFavorites", tabId, index: slot })),
      )

const dropOnSwitcher = (source: DragSource, slot: number): Option.Option<SidebarCommand> =>
  source._tag === "SpaceChip"
    ? reorder(source.index, slot, (toIndex) => ({
        _tag: "MoveSpace",
        spaceId: source.spaceId,
        toIndex,
      }))
    : Option.none()

/**
 * 結果が None のドロップは受け付けない（元の位置に落とした場合や、閉じたピンを一時タブへ
 * 落とした場合など）。spaceId は表示中の Space で、ピン留めや一時タブへの配置先になる。
 */
export const commandForDrop = (
  source: DragSource,
  target: DropTarget,
  spaceId: SpaceId,
): Option.Option<SidebarCommand> =>
  Match.valueTags(target, {
    Temporary: ({ placement }) => dropOnTemporary(source, placement, spaceId),
    Pinned: (pinned) => dropOnPinned(source, pinned, spaceId),
    Favorites: ({ slot }) => dropOnFavorites(source, slot),
    Switcher: ({ slot }) => dropOnSwitcher(source, slot),
  })
