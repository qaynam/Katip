import { Array, Option, Schema } from "effect"
import { TabId } from "#platform/browser"
import { FavoriteId } from "./favorites"

/** A tab open for a Favorite. A Favorite has at most one tab in each window. */
export const FavoriteTab = Schema.Struct({ tabId: TabId, favoriteId: FavoriteId })
export type FavoriteTab = typeof FavoriteTab.Type

export const FavoriteTabs = Schema.Array(FavoriteTab)
export type FavoriteTabs = typeof FavoriteTabs.Type

export const favoriteOfTab = (bindings: FavoriteTabs, tabId: TabId): Option.Option<FavoriteId> =>
  Option.map(
    Array.findFirst(bindings, (binding) => binding.tabId === tabId),
    (binding) => binding.favoriteId,
  )

export const tabsOfFavorite = (
  bindings: FavoriteTabs,
  favoriteId: FavoriteId,
): ReadonlyArray<TabId> =>
  bindings.filter((binding) => binding.favoriteId === favoriteId).map((binding) => binding.tabId)

export const unbindTab = (bindings: FavoriteTabs, tabId: TabId): FavoriteTabs =>
  bindings.filter((binding) => binding.tabId !== tabId)

export const bindTab = (bindings: FavoriteTabs, tabId: TabId, favoriteId: FavoriteId) => [
  ...unbindTab(bindings, tabId),
  { tabId, favoriteId },
]

export const unbindFavorite = (bindings: FavoriteTabs, favoriteId: FavoriteId): FavoriteTabs =>
  bindings.filter((binding) => binding.favoriteId !== favoriteId)

/** Hands the binding of `oldTabId` to `newTabId`, as when Chrome discards a tab. */
export const replaceBoundTab = (
  bindings: FavoriteTabs,
  oldTabId: TabId,
  newTabId: TabId,
): FavoriteTabs =>
  unbindTab(bindings, newTabId).map((binding) =>
    binding.tabId === oldTabId ? { ...binding, tabId: newTabId } : binding,
  )

/** Keeps only the bindings of tabs that are still open. */
export const keepOpenTabs = (bindings: FavoriteTabs, open: ReadonlySet<TabId>): FavoriteTabs =>
  bindings.filter((binding) => open.has(binding.tabId))
