import { Clock, Effect, Option } from "effect"
import { isRefreshDue, LiveFolders, type LiveSource } from "#modules/live-folders"
import { LiveFolderStore, liveFoldersIn, PinnedBookmarks } from "#modules/pinned"
import { Alarms } from "#platform/browser"
import { KatipState } from "./katip-state"

export const LIVE_FOLDER_REFRESH_ALARM = "katip/live-folders/refresh"

const REFRESH_PERIOD_MINUTES = 5

// Side panels reopen in each window, so refreshing on every open would pile up requests
const MIN_REFRESH_INTERVAL_MS = 60_000

/**
 * Schedules periodic refreshes while any live folder exists, and clears the schedule otherwise.
 *
 * This way the service worker of someone who doesn't use live folders isn't woken just to refresh.
 */
export const scheduleLiveFolderRefresh = Effect.gen(function* () {
  const alarms = yield* Alarms
  const marked = yield* (yield* LiveFolderStore).load
  if (marked.size === 0) {
    yield* alarms.clear(LIVE_FOLDER_REFRESH_ALARM)
    return
  }
  // Not recreated on every start: recreating an alarm, even with the same period, pushes its next
  // firing back, and the service worker restarts so often that it might never fire
  const current = (yield* alarms.getAll).find((alarm) => alarm.name === LIVE_FOLDER_REFRESH_ALARM)
  if (current !== undefined && Option.contains(current.periodInMinutes, REFRESH_PERIOD_MINUTES)) {
    return
  }
  yield* alarms.create(LIVE_FOLDER_REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES })
})

const pinnedLiveFolders = Effect.gen(function* () {
  const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees
  return { trees, liveFolders: [...trees.values()].flatMap(liveFoldersIn) }
})

/**
 * Starts refreshing the live folders whose last refresh was long enough ago, without waiting for
 * the refreshes to finish.
 *
 * When the pinned tabs of every Space could be read, drops the cache of live folders that no
 * longer exist anywhere. If any Space couldn't be read nothing is dropped, since that would also
 * lose the contents of the live folders in that Space.
 */
export const refreshDueLiveFolders = Effect.gen(function* () {
  const liveFolders = yield* LiveFolders
  const { trees, liveFolders: present } = yield* pinnedLiveFolders
  const { records } = yield* liveFolders.snapshot
  const now = yield* Clock.currentTimeMillis
  const due = present.filter((live) =>
    isRefreshDue(Option.fromNullishOr(records.get(live.id)), now, MIN_REFRESH_INTERVAL_MS),
  )
  yield* Effect.forEach(due, (live) => liveFolders.refresh(live.id, live.source), {
    discard: true,
  })
  const spaces = yield* (yield* KatipState).spaces.get
  if (spaces.every((space) => trees.has(space.id))) {
    yield* liveFolders.retainOnly(new Set(present.map((live) => live.id)))
  }
})

/** Starts refreshing the live folders whose source matches, however recently they refreshed. */
export const refreshLiveFoldersWhere = (matches: (source: LiveSource) => boolean) =>
  Effect.gen(function* () {
    const liveFolders = yield* LiveFolders
    const { liveFolders: present } = yield* pinnedLiveFolders
    yield* Effect.forEach(
      present.filter((live) => matches(live.source)),
      (live) => liveFolders.refresh(live.id, live.source),
      { discard: true },
    )
  })
