import { Effect, Match } from "effect"
import { PinnedBookmarks, type PinnedTree } from "#modules/pinned"
import type { BookmarkId } from "#platform/browser"
import { KatipState } from "./katip-state"

const bookmarkIdsIn = (tree: PinnedTree): ReadonlyArray<BookmarkId> =>
  tree.flatMap((node) =>
    Match.valueTags(node, {
      PinnedBookmark: ({ id }) => [id],
      PinnedSplit: ({ items }) => items.map((item) => item.id),
      PinnedLiveFolder: () => [],
      PinnedFolder: ({ children }) => bookmarkIdsIn(children),
    }),
  )

/**
 * 存在しなくなったブックマークへのバインディングを外す。
 *
 * ツリーを読めなかった Space のバインディングは残す。一時的な読み込み失敗で、開いている
 * ピンを一時タブに落としてしまわないため。
 */
export const pruneStaleBindings = Effect.gen(function* () {
  const state = yield* KatipState
  const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees
  const existing = new Set([...trees.values()].flatMap(bookmarkIdsIn))
  yield* state.workspace.update((workspace) => ({
    ...workspace,
    tabs: workspace.tabs.map((tab) =>
      tab.pinned !== null && trees.has(tab.spaceId) && !existing.has(tab.pinned.bookmarkId)
        ? { ...tab, pinned: null }
        : tab,
    ),
  }))
})
