import { Array, Option, Record, Schema } from "effect"
import { SpaceId } from "#modules/space"
import { type Favorite, FavoriteId, FavoriteList, favoriteById } from "./favorites"

/** Each Space's Favorites. A Space missing here has none. */
export const SpaceFavorites = Schema.Record(SpaceId, FavoriteList)
export type SpaceFavorites = typeof SpaceFavorites.Type

export const favoritesOf = (favorites: SpaceFavorites, spaceId: SpaceId): FavoriteList =>
  Option.getOrElse(Record.get(favorites, spaceId), (): FavoriteList => [])

export const updateFavoritesOf = (
  favorites: SpaceFavorites,
  spaceId: SpaceId,
  update: (list: FavoriteList) => FavoriteList,
): SpaceFavorites => Record.set(favorites, spaceId, update(favoritesOf(favorites, spaceId)))

export const forgetSpaceFavorites = (favorites: SpaceFavorites, spaceId: SpaceId): SpaceFavorites =>
  Record.remove(favorites, spaceId)

export interface FoundFavorite {
  readonly spaceId: SpaceId
  readonly favorite: Favorite
}

export const findFavorite = (
  favorites: SpaceFavorites,
  id: FavoriteId,
): Option.Option<FoundFavorite> =>
  Array.findFirst(Record.toEntries(favorites), ([spaceId, list]) =>
    Option.map(favoriteById(list, id), (favorite) => ({ spaceId, favorite })),
  )

/**
 * The ID of the copy, in `spaceId`, of a Favorite from the time every Space shared the Favorites.
 *
 * @remarks
 * Derived rather than random so that what still names the shared Favorite, such as the record of
 * its tab saved for a restart, finds the copy in the Space shown in the tab's window.
 */
export const carriedFavoriteId = (sharedId: FavoriteId, spaceId: SpaceId): FavoriteId =>
  FavoriteId.make(`${spaceId}/${sharedId}`)

/**
 * Gives every Space in `spaceIds` that has no Favorites of its own yet a copy of the Favorites
 * every Space shared before each had its own.
 */
export const carrySharedFavorites = (
  favorites: SpaceFavorites,
  shared: FavoriteList,
  spaceIds: ReadonlyArray<SpaceId>,
): SpaceFavorites =>
  spaceIds.reduce(
    (acc, spaceId) =>
      Record.has(acc, spaceId)
        ? acc
        : Record.set(
            acc,
            spaceId,
            shared.map((favorite) => ({
              ...favorite,
              id: carriedFavoriteId(favorite.id, spaceId),
            })),
          ),
    favorites,
  )

/**
 * The Favorite that `id` names as seen from `spaceId`: the Favorite itself, else, for the ID of a
 * Favorite every Space shared, its copy in `spaceId`.
 */
export const resolveFavoriteId = (
  favorites: SpaceFavorites,
  id: FavoriteId,
  spaceId: Option.Option<SpaceId>,
): Option.Option<FoundFavorite> =>
  Option.orElse(findFavorite(favorites, id), () =>
    Option.flatMap(spaceId, (space) => findFavorite(favorites, carriedFavoriteId(id, space))),
  )
