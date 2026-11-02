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

// Chrome restores tabs all at once right after startup. Records left unclaimed expire: kept
// forever, they would send a tab that happens to open the same URL days later back to an old Space
export const RESTORE_WINDOW_MS = 5 * 60 * 1000

/**
 * Records the tracked tabs by URL so they can be matched up again after a restart.
 *
 * @param liveTabs - The open tabs, ordered by window and then by tab index. When several tabs share
 *   a URL, restoring matches them up in this order.
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
 * Takes out the first record whose URL matches exactly and whose Space still exists. Returns none
 * once the queue has expired.
 *
 * Only exact matches: allowing a different query or hash would mistake another page of the same
 * site for the tab.
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
