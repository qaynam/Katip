import { Array, Option, Schema } from "effect"

export const FavoriteId = Schema.String.pipe(Schema.brand("FavoriteId"))
export type FavoriteId = typeof FavoriteId.Type

/**
 * A page kept in Favorites, whether a tab is open for it or not. Every window shows the same
 * Favorites, and opens each one as a tab pinned in Chrome.
 */
export const Favorite = Schema.Struct({
  id: FavoriteId,
  url: Schema.String,
  title: Schema.String,
})
export type Favorite = typeof Favorite.Type

/** In the order Favorites shows them. */
export const FavoriteList = Schema.Array(Favorite)
export type FavoriteList = typeof FavoriteList.Type

const indexOfFavorite = (list: FavoriteList, id: FavoriteId) =>
  list.findIndex((favorite) => favorite.id === id)

export const favoriteById = (list: FavoriteList, id: FavoriteId): Option.Option<Favorite> =>
  Array.findFirst(list, (favorite) => favorite.id === id)

/** Puts the favorite at `index`, or at the end when `index` is past it. */
export const insertFavorite = (
  list: FavoriteList,
  favorite: Favorite,
  index: number,
): FavoriteList => {
  const at = Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, at), favorite, ...list.slice(at)]
}

export const removeFavorite = (list: FavoriteList, id: FavoriteId): FavoriteList =>
  list.filter((favorite) => favorite.id !== id)

/** `toIndex` is where the favorite ends up, counted in the list without it. */
export const moveFavorite = (list: FavoriteList, id: FavoriteId, toIndex: number): FavoriteList =>
  Option.match(favoriteById(list, id), {
    onNone: () => list,
    onSome: (favorite) => insertFavorite(removeFavorite(list, id), favorite, toIndex),
  })

/**
 * Where a favorite goes so that it sits between the favorites of the tabs on either side of its
 * own: right after `before`, or right before `after` when nothing is before it. At the end when
 * neither is in the list.
 */
export const indexBetween = (
  list: FavoriteList,
  before: Option.Option<FavoriteId>,
  after: Option.Option<FavoriteId>,
): number => {
  const afterBefore = Option.map(before, (id) => indexOfFavorite(list, id))
  if (Option.isSome(afterBefore) && afterBefore.value >= 0) return afterBefore.value + 1
  const atAfter = Option.map(after, (id) => indexOfFavorite(list, id))
  if (Option.isSome(atAfter) && atAfter.value >= 0) return atAfter.value
  return list.length
}

/**
 * Where the tab of the favorite `id` goes among a window's pinned tabs: right after the tabs of
 * the favorites before it that are open in that window.
 */
export const pinnedIndexOf = (
  list: FavoriteList,
  id: FavoriteId,
  openInWindow: ReadonlySet<FavoriteId>,
): number =>
  list
    .slice(0, Math.max(0, indexOfFavorite(list, id)))
    .filter((favorite) => openInWindow.has(favorite.id)).length

/**
 * The list reordered after the tab of the favorite `moved` moved among a window's pinned tabs, so
 * the favorites open there follow the order of their tabs. Closed favorites keep their places.
 *
 * @param windowOrder - The favorites open in the window, in the order of their tabs.
 */
export const followTabOrder = (
  list: FavoriteList,
  moved: FavoriteId,
  windowOrder: ReadonlyArray<FavoriteId>,
): FavoriteList => {
  const position = windowOrder.indexOf(moved)
  const listOrder = list
    .filter((favorite) => windowOrder.includes(favorite.id))
    .map((favorite) => favorite.id)
  if (position < 0 || Array.makeEquivalence<FavoriteId>(Object.is)(listOrder, windowOrder)) {
    return list
  }
  const without = removeFavorite(list, moved)
  const index = indexBetween(
    without,
    Array.get(windowOrder, position - 1),
    Array.get(windowOrder, position + 1),
  )
  return Option.match(favoriteById(list, moved), {
    onNone: () => list,
    onSome: (favorite) => insertFavorite(without, favorite, index),
  })
}
