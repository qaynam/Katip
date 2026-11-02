import { Clock, Effect, Option } from "effect"
import {
  ArchiveRepository,
  autoArchiveCheckIntervalMinutes,
  selectAutoArchiveTargets,
} from "#modules/archive"
import { SettingsRepository } from "#modules/settings"
import { trackedTab } from "#modules/workspace"
import { Alarms, Tabs } from "#platform/browser"
import { KatipState } from "./katip-state"
import { urlOf } from "./tab-admission"

export const AUTO_ARCHIVE_ALARM = "katip/auto-archive"

// Not recreated on every start: recreating an alarm, even with the same period, pushes its next
// firing back, and the service worker restarts so often that it might never fire
export const scheduleAutoArchive = Effect.gen(function* () {
  const alarms = yield* Alarms
  const { autoArchive } = yield* (yield* SettingsRepository).get
  if (!autoArchive.enabled) {
    yield* alarms.clear(AUTO_ARCHIVE_ALARM)
    return
  }
  const periodInMinutes = autoArchiveCheckIntervalMinutes(autoArchive.idleMinutes)
  const current = (yield* alarms.getAll).find((alarm) => alarm.name === AUTO_ARCHIVE_ALARM)
  if (current !== undefined && Option.contains(current.periodInMinutes, periodInMinutes)) return
  yield* alarms.create(AUTO_ARCHIVE_ALARM, { periodInMinutes })
})

export const runAutoArchive = Effect.gen(function* () {
  const { autoArchive } = yield* (yield* SettingsRepository).get
  if (!autoArchive.enabled) return
  const tabs = yield* Tabs
  const workspace = yield* (yield* KatipState).workspace.get
  const now = yield* Clock.currentTimeMillis
  const candidates = (yield* tabs.query({})).map((tab) => {
    const tracked = trackedTab(workspace, tab.id)
    return {
      tab,
      spaceId: Option.map(tracked, (t) => t.spaceId),
      isActive: tab.active,
      isAudible: tab.audible,
      isChromePinned: tab.pinned,
      isBoundToPin: Option.exists(tracked, (t) => t.pinned !== null),
      // A tab in no Space is never archived, so its time doesn't matter
      lastActiveAt: Option.match(tracked, { onNone: () => now, onSome: (t) => t.lastActiveAt }),
    }
  })
  const targets = selectAutoArchiveTargets(candidates, {
    now,
    idleMinutes: autoArchive.idleMinutes,
  })
  const archive = yield* ArchiveRepository
  yield* Effect.forEach(
    targets,
    ({ tab, spaceId }) =>
      archive.add({
        url: urlOf(tab.tab),
        title: Option.getOrElse(tab.tab.title, () => urlOf(tab.tab)),
        spaceId,
      }),
    { discard: true },
  )
  if (targets.length > 0) yield* tabs.remove(targets.map(({ tab }) => tab.tab.id))
})
