import { Context, Effect, Layer, Schema } from "effect"
import {
  FavoriteList,
  FavoriteRestoreQueue,
  FavoriteRestoreSnapshot,
  FavoriteTabs,
} from "#modules/favorites"
import { SpaceList } from "#modules/space"
import { emptyWorkspace, RestoreQueue, RestoreSnapshot, Workspace } from "#modules/workspace"
import { Storage } from "#platform/browser"
import { makePersistedRef, type PersistedRef } from "#platform/persisted-ref"

export const RESTORE_SNAPSHOT_KEY = "katip/restore-snapshot"
export const FAVORITE_RESTORE_SNAPSHOT_KEY = "katip/favorite-restore-snapshot"

export class KatipState extends Context.Service<
  KatipState,
  {
    readonly spaces: PersistedRef<SpaceList>
    readonly workspace: PersistedRef<Workspace>
    readonly restoreQueue: PersistedRef<RestoreQueue | null>
    readonly favorites: PersistedRef<FavoriteList>
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
      const favorites = yield* makePersistedRef({
        area: storage.local,
        key: "katip/favorites",
        schema: FavoriteList,
        initial: () => [],
      })
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
        favorites,
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
