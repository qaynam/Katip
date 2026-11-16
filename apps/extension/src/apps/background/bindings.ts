import { Effect, Match } from "effect"
import { liveFoldersIn, PinnedBookmarks, type PinnedTree } from "#modules/pinned"
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
 * Unbinds tabs from bookmarks and live folders that no longer exist.
 *
 * Bindings in a Space whose tree couldn't be read are kept, so that a passing read failure doesn't
 * turn open pinned tabs into temporary tabs.
 *
 * A live item gone from its source keeps its tab bound: the tab stays on the item's row until it
 * closes.
 */
export const pruneStaleBindings = Effect.gen(function* () {
  const state = yield* KatipState
  const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees
  const existing = new Set([...trees.values()].flatMap(bookmarkIdsIn))
  const existingLiveFolders = new Set(
    [...trees.values()].flatMap((tree) => liveFoldersIn(tree).map((live) => live.id)),
  )
  yield* state.workspace.update((workspace) => ({
    ...workspace,
    tabs: workspace.tabs.map((tab) => {
      if (!trees.has(tab.spaceId)) return tab
      const isPinGone = tab.pinned !== null && !existing.has(tab.pinned.bookmarkId)
      const isLiveFolderGone =
        tab.liveItem !== null && !existingLiveFolders.has(tab.liveItem.folderId)
      return {
        ...tab,
        pinned: isPinGone ? null : tab.pinned,
        liveItem: isLiveFolderGone ? null : tab.liveItem,
      }
    }),
  }))
})
