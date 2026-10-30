import { Context, Effect, Layer, Schema } from "effect"
import { SpaceList } from "#modules/space"
import { emptyWorkspace, RestoreQueue, RestoreSnapshot, Workspace } from "#modules/workspace"
import { Storage } from "#platform/browser"
import { makePersistedRef, type PersistedRef } from "#platform/persisted-ref"

export const RESTORE_SNAPSHOT_KEY = "katip/restore-snapshot"

export class KatipState extends Context.Service<
  KatipState,
  {
    readonly spaces: PersistedRef<SpaceList>
    readonly workspace: PersistedRef<Workspace>
    readonly restoreQueue: PersistedRef<RestoreQueue | null>
    /**
     * session storage に所属の記録が無い状態で起動したか。ブラウザの再起動と拡張の再読み込みで
     * 真になり、タブ ID を信用できないので URL 照合で所属を復元する。
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
      return KatipState.of({
        spaces,
        workspace,
        restoreQueue,
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
