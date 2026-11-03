import { Array, Context, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect"
import { BrowserApiError, Storage, TabGroups, Tabs } from "#platform/browser"
import { type ProjectedGroup, TabGroupProjection } from "./tab-group-projection"
import { type DesiredGroup, planTabGroupSync, TabGroupOperation } from "./tab-group-sync-plan"

const projectionKey = "katip/tab-group-sync/projection"

export const TabGroupOperationFailure = Schema.Struct({
  operation: TabGroupOperation,
  cause: BrowserApiError,
})
export type TabGroupOperationFailure = typeof TabGroupOperationFailure.Type

export class TabGroupSyncIncomplete extends Schema.TaggedError<TabGroupSyncIncomplete>()(
  "TabGroupSyncIncomplete",
  { failures: Schema.NonEmptyArray(TabGroupOperationFailure) },
) {}

export class TabGroupSync extends Context.Service<
  TabGroupSync,
  {
    /**
     * Brings Chrome's tab groups in line with `desired`, then saves and returns the new projection.
     *
     * @param desired - What every window should look like. The group of a Space and window not in
     *   it is no longer managed by Katip, and the tabs left in it are ungrouped.
     *
     * @remarks
     * A failed operation doesn't stop the remaining ones. The projection is saved first, then the
     * failures are returned together as {@link TabGroupSyncIncomplete}. What failed is retried by
     * the next sync. Concurrent calls run one at a time, in order.
     */
    sync(
      desired: ReadonlyArray<DesiredGroup>,
    ): Effect.Effect<TabGroupProjection, TabGroupSyncIncomplete | BrowserApiError>
  }
>()("katip/tab-group-sync/TabGroupSync") {
  static readonly layer = Layer.effect(
    TabGroupSync,
    Effect.gen(function* () {
      const tabs = yield* Tabs
      const tabGroups = yield* TabGroups
      const storage = yield* Storage
      const oneAtATime = yield* Semaphore.make(1)

      const loadProjection = storage.session.getDecoded(projectionKey, TabGroupProjection).pipe(
        Effect.map(Option.getOrElse((): TabGroupProjection => [])),
        // Not a failure: a broken projection would block every sync, while treating every group as
        // unmanaged just rebuilds them
        Effect.catchTag("StorageDecodeError", (error) =>
          Effect.as(
            Effect.logWarning("Discarding the tab group projection it couldn't read", error),
            [],
          ),
        ),
      )

      const saveProjection = (projection: TabGroupProjection) =>
        Schema.encodeEffect(TabGroupProjection)(projection).pipe(
          Effect.orDie,
          Effect.flatMap((encoded) => storage.session.set(projectionKey, encoded)),
        )

      const syncNow = Effect.fn("TabGroupSync.sync")(function* (
        desired: ReadonlyArray<DesiredGroup>,
      ) {
        const projection = yield* loadProjection
        const [actualTabs, actualGroups] = yield* Effect.all([tabs.query({}), tabGroups.query({})])
        const plan = planTabGroupSync(desired, actualTabs, actualGroups, projection)

        // A created group stays in the projection even when styling it fails. Otherwise the next
        // sync would create a second group for the same Space
        const createdGroups = yield* Ref.make<ReadonlyArray<ProjectedGroup>>([])
        const perform = TabGroupOperation.match({
          CreateGroup: ({ spaceId, windowId, tabIds, appearance }) =>
            tabs.group({ tabIds, windowId }).pipe(
              Effect.tap((groupId) =>
                Ref.update(createdGroups, Array.append({ spaceId, windowId, groupId })),
              ),
              Effect.flatMap((groupId) => tabGroups.update(groupId, appearance)),
              Effect.asVoid,
            ),
          AddTabsToGroup: ({ groupId, tabIds }) => Effect.asVoid(tabs.group({ groupId, tabIds })),
          UpdateGroup: ({ groupId, appearance }) =>
            Effect.asVoid(tabGroups.update(groupId, appearance)),
          UngroupTabs: ({ tabIds }) => tabs.ungroup(tabIds),
        })

        // Not concurrent: the plan adds tabs to groups before removing them, and out of order a
        // group could empty first and be deleted
        const [, failures] = yield* Effect.partition(
          plan.operations,
          (operation) => Effect.mapError(perform(operation), (cause) => ({ operation, cause })),
          { concurrency: 1 },
        )
        const nextProjection = [...plan.reusedGroups, ...(yield* Ref.get(createdGroups))]
        yield* saveProjection(nextProjection)

        if (Array.isReadonlyArrayNonEmpty(failures)) {
          return yield* new TabGroupSyncIncomplete({ failures })
        }
        return nextProjection
      })

      return TabGroupSync.of({
        sync: (desired) => oneAtATime.withPermits(1)(syncNow(desired)),
      })
    }),
  )
}
