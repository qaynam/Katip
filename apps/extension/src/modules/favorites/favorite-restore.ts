import { Array, Option, pipe, Schema } from "effect"
import type { TabId } from "#platform/browser"
import { favoriteOfTab, type FavoriteTabs } from "./favorite-tabs"
import { FavoriteId } from "./favorites"

/**
 * The page a Favorite's tab showed. Tab IDs change when the browser restarts, so the tab is found
 * again by this URL, which may have left the Favorite's own URL.
 */
export const FavoriteRestoreRecord = Schema.Struct({ url: Schema.String, favoriteId: FavoriteId })
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
  liveTabs: ReadonlyArray<{ readonly tabId: TabId; readonly url: string }>,
): FavoriteRestoreSnapshot =>
  Array.getSomes(
    liveTabs.map(({ tabId, url }) =>
      url === ""
        ? Option.none()
        : Option.map(favoriteOfTab(bindings, tabId), (favoriteId) => ({ url, favoriteId })),
    ),
  )

/**
 * Takes out the first record whose URL matches exactly and whose Favorite `isWanted` accepts.
 * Returns none once the queue has expired.
 */
export const claimFavoriteRecord = (
  queue: FavoriteRestoreQueue,
  url: string,
  now: number,
  isWanted: (favoriteId: FavoriteId) => boolean,
): Option.Option<readonly [FavoriteId, FavoriteRestoreQueue]> =>
  now > queue.expiresAt
    ? Option.none()
    : pipe(
        Array.findFirstIndex(
          queue.records,
          (record) => record.url === url && isWanted(record.favoriteId),
        ),
        Option.map((index) => [
          (queue.records[index] as FavoriteRestoreRecord).favoriteId,
          { ...queue, records: Array.remove(queue.records, index) },
        ]),
      )
