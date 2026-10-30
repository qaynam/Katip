import { Array, Option, pipe, Schema } from "effect"
import { SpaceId } from "#modules/space"
import type { TabId } from "#platform/browser"
import { PinnedBinding, trackedTab, type Workspace } from "./workspace"

export const RestoreRecord = Schema.Struct({
  url: Schema.String,
  spaceId: SpaceId,
  pinned: Schema.NullOr(PinnedBinding),
  titleOverride: Schema.NullOr(Schema.String),
})
export type RestoreRecord = typeof RestoreRecord.Type

export const RestoreSnapshot = Schema.Array(RestoreRecord)
export type RestoreSnapshot = typeof RestoreSnapshot.Type

export const RestoreQueue = Schema.Struct({
  records: Schema.Array(RestoreRecord),
  expiresAt: Schema.Number,
})
export type RestoreQueue = typeof RestoreQueue.Type

// Chrome は起動直後にまとめてタブを復元する。消費されなかったレコードを残し続けると、
// 後日たまたま同じ URL を開いたタブを古い Space へ誤って戻してしまうため、期限で打ち切る
export const RESTORE_WINDOW_MS = 5 * 60 * 1000

/**
 * 再起動後に URL で照合するための記録を作る。
 *
 * @param liveTabs - ウィンドウ順・タブ index 順に並べた生存中のタブ。同じ URL のタブが
 *   複数あるとき、復元時はこの順に対応づける。
 */
export const takeSnapshot = (
  workspace: Workspace,
  liveTabs: ReadonlyArray<{ readonly tabId: TabId; readonly url: string }>,
): RestoreSnapshot =>
  Array.getSomes(
    liveTabs.map(({ tabId, url }) =>
      url === ""
        ? Option.none()
        : Option.map(trackedTab(workspace, tabId), (tab) => ({
            url,
            spaceId: tab.spaceId,
            pinned: tab.pinned,
            titleOverride: tab.titleOverride,
          })),
    ),
  )

export const startRestore = (snapshot: RestoreSnapshot, now: number): RestoreQueue => ({
  records: snapshot,
  expiresAt: now + RESTORE_WINDOW_MS,
})

/**
 * URL が完全一致する最初のレコードを取り出す。
 *
 * クエリやハッシュの違いを許すと、同じサイトの別ページを取り違えるため完全一致に限る。
 */
export const claimRestoreRecord = (
  queue: RestoreQueue,
  url: string,
  now: number,
  spaceExists: (spaceId: SpaceId) => boolean,
): Option.Option<readonly [RestoreRecord, RestoreQueue]> =>
  now > queue.expiresAt
    ? Option.none()
    : pipe(
        Array.findFirstIndex(
          queue.records,
          (record) => record.url === url && spaceExists(record.spaceId),
        ),
        Option.map((index) => [
          queue.records[index] as RestoreRecord,
          { ...queue, records: Array.remove(queue.records, index) },
        ]),
      )

export const restoreTab = (
  workspace: Workspace,
  tabId: TabId,
  record: RestoreRecord,
  now: number,
): Workspace => ({
  ...workspace,
  tabs: [
    ...workspace.tabs.filter((tab) => tab.tabId !== tabId),
    {
      tabId,
      spaceId: record.spaceId,
      pinned: record.pinned,
      titleOverride: record.titleOverride,
      lastActiveAt: now,
    },
  ],
})
