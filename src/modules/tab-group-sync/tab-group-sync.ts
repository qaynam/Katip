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
     * Chrome のタブグループを `desired` に揃え、新しい対応表を保存して返す。
     *
     * @param desired - 全ウィンドウ分のあるべき姿。含まれない Space・ウィンドウのグループは
     *   Katip の管理から外れ、そこに残ったタブはグループから外される。
     *
     * @remarks
     * 操作が失敗しても残りの操作は続け、対応表を保存してから失敗をまとめて
     * {@link TabGroupSyncIncomplete} で返す。失敗した分は次の同期でやり直される。
     * 同時に呼ばれても 1 回ずつ順に実行する。
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
        // 壊れた対応表で同期を止め続けるより、全グループを管理外とみなして作り直すほうがよい
        Effect.catchTag("StorageDecodeError", (error) =>
          Effect.as(Effect.logWarning("タブグループの対応表を読めなかったので捨てる", error), []),
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

        // 作ったグループの見た目を整える呼び出しが失敗しても、グループ自体は対応表に残す。
        // 残さないと次の同期で同じ Space のグループをもう 1 つ作ってしまう
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

        // 計画は「グループへ入れてから外す」順に並んでいて、並行に流すとグループが先に空になって消える
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
