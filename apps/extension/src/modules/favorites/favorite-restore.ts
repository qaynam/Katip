import { Array, Effect, Option, pipe, Schema } from "effect"
import type { TabId } from "#platform/browser"
import { favoriteOfTab, type FavoriteTabs } from "./favorite-tabs"
import { FavoriteId } from "./favorites"

/**
 * The page a Favorite's tab showed. Tab IDs change when the browser restarts, so the tab is found
 * again by this URL, which may have left the Favorite's own URL.
 */
export const FavoriteRestoreRecord = Schema.Struct({
  url: Schema.String,
  favoriteId: FavoriteId,
  /**
   * Whether the tab was pinned in Chrome, as it is while its Favorite's Space is shown. Chrome
   * restores tabs pinned or not as they were, so a record is claimed only by a tab alike.
   */
  // Records saved before each Space had its own Favorites have no such key; every Favorite's tab
  // was pinned then
  isPinned: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
})
export type FavoriteRestoreRecord = typeof FavoriteRestoreRecord.Type

export const FavoriteRestoreSnapshot = Schema.Array(FavoriteRestoreRecord)
export type FavoriteRestoreSnapshot = typeof FavoriteRestoreSnapshot.Type

export const FavoriteRestoreQueue = Schema.Struct({
  records: FavoriteRestoreSnapshot,
  expiresAt: Schema.Number,
})
export type FavoriteRestoreQueue = typeof FavoriteRestoreQueue.Type

/**
 * Records the open Favorites' tabs by URL.
 *
 * @param liveTabs - The open tabs, ordered by window and then by tab index. When several tabs share
 *   a URL, restoring matches them up in this order.
 */
export const takeFavoriteSnapshot = (
  bindings: FavoriteTabs,
  liveTabs: ReadonlyArray<{
    readonly tabId: TabId
    readonly url: string
    readonly pinned: boolean
  }>,
): FavoriteRestoreSnapshot =>
  Array.getSomes(
    liveTabs.map(({ tabId, url, pinned }) =>
      url === ""
        ? Option.none()
        : Option.map(favoriteOfTab(bindings, tabId), (favoriteId) => ({
            url,
            favoriteId,
            isPinned: pinned,
          })),
    ),
  )

/**
 * Takes out the first record of a tab pinned or not as `isPinned` says, whose URL matches exactly
 * and whose Favorite `resolve` finds. Returns none once the queue has expired.
 *
 * @param resolve - The Favorite to give the tab for a record's Favorite, or none when the record's
 *   Favorite is gone or not wanted.
 */
export const claimFavoriteRecord = (
  queue: FavoriteRestoreQueue,
  tab: { readonly url: string; readonly isPinned: boolean },
  now: number,
  resolve: (favoriteId: FavoriteId) => Option.Option<FavoriteId>,
): Option.Option<readonly [FavoriteId, FavoriteRestoreQueue]> =>
  now > queue.expiresAt
    ? Option.none()
    : pipe(
        Array.findFirst(queue.records, (record, index) =>
          record.url === tab.url && record.isPinned === tab.isPinned
            ? Option.map(resolve(record.favoriteId), (favoriteId) => [favoriteId, index] as const)
            : Option.none(),
        ),
        Option.map(([favoriteId, index]) => [
          favoriteId,
          { ...queue, records: Array.remove(queue.records, index) },
        ]),
      )
