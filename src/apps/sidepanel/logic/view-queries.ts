import { Array, Option, Order, pipe } from "effect"
import type { ArchiveEntry } from "#modules/archive"
import { SpaceColor, type SpaceId } from "#modules/space"
import type { BookmarkId } from "#platform/browser"
import type { PinnedFolderView, PinnedItemView, SidebarView, SpaceView } from "#protocol"
import type { PinnedPosition } from "./drag-drop"

export const findActiveSpace = (view: SidebarView): Option.Option<SpaceView> =>
  Array.findFirst(view.spaces, (space) => space.id === view.activeSpaceId)

export const otherSpaces = (view: SidebarView): ReadonlyArray<SpaceView> =>
  view.spaces.filter((space) => space.id !== view.activeSpaceId)

export type ArchiveScope = "currentSpace" | "allSpaces"

const newestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (entry: ArchiveEntry) => entry.archivedAt,
)

export const archiveEntriesFor = (
  entries: ReadonlyArray<ArchiveEntry>,
  scope: ArchiveScope,
  spaceId: SpaceId,
): ReadonlyArray<ArchiveEntry> =>
  pipe(
    entries,
    Array.filter((entry) => scope === "allSpaces" || entry.spaceId === spaceId),
    Array.sort(newestFirst),
  )

export const suggestedSpaceColor = (spaces: ReadonlyArray<{ readonly color: SpaceColor }>) => {
  const used = new Set(spaces.map((space) => space.color))
  return pipe(
    Array.findFirst(SpaceColor.literals, (color) => !used.has(color)),
    Option.getOrElse(
      () => SpaceColor.literals[spaces.length % SpaceColor.literals.length] ?? "grey",
    ),
  )
}

export const hostOf = (url: string): Option.Option<string> =>
  Option.liftThrowable(() => new URL(url).host)().pipe(Option.filter((host) => host !== ""))

export type PinnedItemDisplay =
  | { readonly _tag: "Closed"; readonly title: string }
  | { readonly _tag: "AtPinnedUrl"; readonly title: string }
  | { readonly _tag: "NavigatedAway"; readonly title: string }

const firstNonEmpty = (...candidates: ReadonlyArray<string>): string =>
  candidates.find((candidate) => candidate.trim() !== "") ?? ""

// ピンした URL にいる間はピンに付けた名前を出し、別のページへ移ったら実際のページの名前を出す。
// 移動先でもピンの名前のままだと、今どのページを見ているのか分からなくなるため
export const pinnedItemDisplay = (item: PinnedItemView): PinnedItemDisplay => {
  const fallbackTitle = Option.getOrElse(hostOf(item.url), () => item.url)
  if (item.openTab === null) {
    return { _tag: "Closed", title: firstNonEmpty(item.title, fallbackTitle) }
  }
  const { tab, hasNavigatedAway } = item.openTab
  return hasNavigatedAway
    ? { _tag: "NavigatedAway", title: firstNonEmpty(tab.title, tab.url) }
    : { _tag: "AtPinnedUrl", title: firstNonEmpty(item.title, tab.title, fallbackTitle) }
}

export const childPosition = (
  folder: PinnedFolderView,
  bookmarkId: BookmarkId,
): PinnedPosition | null =>
  pipe(
    Array.findFirstIndex(folder.children, (child) => child.bookmarkId === bookmarkId),
    Option.map((index) => ({ parentId: folder.bookmarkId, index })),
    Option.getOrNull,
  )
