import { Context, Effect, Layer, Option, Schema } from "effect"
import {
  carrySharedFavorites,
  FavoriteList,
  FavoriteRestoreQueue,
  FavoriteRestoreSnapshot,
  FavoriteTabs,
  SpaceFavorites,
} from "#modules/favorites"
import { SpaceList } from "#modules/space"
import { emptyWorkspace, RestoreQueue, RestoreSnapshot, Workspace } from "#modules/workspace"
import { Storage, type StorageArea } from "#platform/browser"
import { makePersistedRef, type PersistedRef } from "#platform/persisted-ref"

export const RESTORE_SNAPSHOT_KEY = "katip/restore-snapshot"
export const FAVORITE_RESTORE_SNAPSHOT_KEY = "katip/favorite-restore-snapshot"
/** Where the Favorites every Space shared were kept, before each Space had its own. */
export const SHARED_FAVORITES_KEY = "katip/favorites"
export const SPACE_FAVORITES_KEY = "katip/space-favorites"

const loadSharedFavorites = (area: StorageArea) =>
  area
    .getDecoded(SHARED_FAVORITES_KEY, FavoriteList)
    .pipe(
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("Couldn't read the shared Favorites", error), Option.none()),
      ),
    )

/**
 * Copies the Favorites every Space shared into each Space, the first time Katip starts with each
 * Space having its own.
 *
 * @returns The shared Favorites when they couldn't be copied yet, as when there is no Space to copy
 *   them into. They are still kept where they were, to be carried once a Space exists.
 */
// Copied only while nothing is stored under the key of each Space's own Favorites, and in a single
// write of that key: copying again after an interruption would bring back Favorites removed since,
// and give them to Spaces created since, which start with none. The old key goes only after that
const carryOverSharedFavorites = Effect.fnUntraced(function* (
  area: StorageArea,
  spaceFavorites: PersistedRef<SpaceFavorites>,
  spaces: SpaceList,
) {
  const shared = yield* loadSharedFavorites(area)
  if (Option.isNone(shared)) return Option.none<FavoriteList>()
  if (!spaceFavorites.wasStored) {
    if (spaces.length === 0) return shared
    const isCarried = yield* spaceFavorites
      .update((favorites) =>
        carrySharedFavorites(
          favorites,
          shared.value,
          spaces.map((space) => space.id),
        ),
      )
      .pipe(
        Effect.as(true),
        Effect.catch((error) =>
          Effect.as(Effect.logWarning("Couldn't carry the shared Favorites", error), false),
        ),
      )
    if (!isCarried) return shared
  }
  yield* forgetSharedFavorites(area)
  return Option.none<FavoriteList>()
})

/** Removes the Favorites every Space shared, once each Space has its copy. */
export const forgetSharedFavorites = (area: StorageArea) =>
  area
    .remove(SHARED_FAVORITES_KEY)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("Couldn't remove the shared Favorites after carrying them", error),
      ),
    )

export class KatipState extends Context.Service<
  KatipState,
  {
    readonly spaces: PersistedRef<SpaceList>
    readonly workspace: PersistedRef<Workspace>
    readonly restoreQueue: PersistedRef<RestoreQueue | null>
    readonly spaceFavorites: PersistedRef<SpaceFavorites>
    /**
     * The Favorites every Space shared, found at startup with no Space to copy them into. None
     * once they have been copied.
     */
    readonly sharedFavoritesAwaitingSpace: Option.Option<FavoriteList>
    /** Which tab is open for which Favorite. Tab IDs last only for a browser session. */
    readonly favoriteTabs: PersistedRef<FavoriteTabs>
    readonly favoriteRestoreQueue: PersistedRef<FavoriteRestoreQueue | null>
    /**
     * Whether it started with no record in session storage of which Space each tab belongs to.
     * True after a browser restart or an extension reload; tab IDs can't be trusted then, so the
     * Spaces are restored by matching URLs.
     */
    readonly isFreshSession: boolean
  }
>()("katip/background/KatipState") {
  static readonly layer = Layer.effect(
    KatipState,
    Effect.gen(function* () {
      const storage = yield* Storage
      const spaces = yield* makePersistedRef({
        area: storage.local,
        key: "katip/spaces",
        schema: SpaceList,
        initial: () => [],
      })
      const workspace = yield* makePersistedRef({
        area: storage.session,
        key: "katip/workspace",
        schema: Workspace,
        initial: () => emptyWorkspace,
      })
      const restoreQueue = yield* makePersistedRef({
        area: storage.session,
        key: "katip/restore-queue",
        schema: Schema.NullOr(RestoreQueue),
        initial: () => null,
      })
      const spaceFavorites = yield* makePersistedRef({
        area: storage.local,
        key: SPACE_FAVORITES_KEY,
        schema: SpaceFavorites,
        initial: () => ({}),
      })
      const sharedFavoritesAwaitingSpace = yield* carryOverSharedFavorites(
        storage.local,
        spaceFavorites,
        yield* spaces.get,
      )
      const favoriteTabs = yield* makePersistedRef({
        area: storage.session,
        key: "katip/favorite-tabs",
        schema: FavoriteTabs,
        initial: () => [],
      })
      const favoriteRestoreQueue = yield* makePersistedRef({
        area: storage.session,
        key: "katip/favorite-restore-queue",
        schema: Schema.NullOr(FavoriteRestoreQueue),
        initial: () => null,
      })
      return KatipState.of({
        spaces,
        workspace,
        restoreQueue,
        spaceFavorites,
        sharedFavoritesAwaitingSpace,
        favoriteTabs,
        favoriteRestoreQueue,
        isFreshSession: !workspace.wasStored,
      })
    }),
  )
}

export const loadRestoreSnapshot = Effect.gen(function* () {
  const storage = yield* Storage
  return yield* storage.local
    .getDecoded(RESTORE_SNAPSHOT_KEY, RestoreSnapshot)
    .pipe(Effect.catchTag("StorageDecodeError", () => Effect.succeedNone))
})

export const saveRestoreSnapshot = (snapshot: RestoreSnapshot) =>
  Effect.gen(function* () {
    const storage = yield* Storage
    const encoded = yield* Schema.encodeEffect(RestoreSnapshot)(snapshot).pipe(Effect.orDie)
    yield* storage.local.set(RESTORE_SNAPSHOT_KEY, encoded)
  })

export const loadFavoriteRestoreSnapshot = Effect.gen(function* () {
  const storage = yield* Storage
  return yield* storage.local
    .getDecoded(FAVORITE_RESTORE_SNAPSHOT_KEY, FavoriteRestoreSnapshot)
    .pipe(Effect.catchTag("StorageDecodeError", () => Effect.succeedNone))
})

export const saveFavoriteRestoreSnapshot = (snapshot: FavoriteRestoreSnapshot) =>
  Effect.gen(function* () {
    const storage = yield* Storage
    const encoded = yield* Schema.encodeEffect(FavoriteRestoreSnapshot)(snapshot).pipe(Effect.orDie)
    yield* storage.local.set(FAVORITE_RESTORE_SNAPSHOT_KEY, encoded)
  })
