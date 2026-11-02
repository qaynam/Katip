import { Array, Number, Option } from "effect"
import type { SpaceId } from "#modules/space"

export interface AutoArchiveTab {
  /** None for a tab that belongs to no Space. */
  readonly spaceId: Option.Option<SpaceId>
  readonly isActive: boolean
  readonly isAudible: boolean
  readonly isChromePinned: boolean
  readonly isBoundToPin: boolean
  /**
   * When the tab last became active, in epoch milliseconds. For a tab that has never been active,
   * pass its creation time or the browser's startup time instead.
   */
  readonly lastActiveAt: number
}

export interface AutoArchiveTarget<T extends AutoArchiveTab> {
  readonly tab: T
  readonly spaceId: SpaceId
}

export interface AutoArchiveCriteria {
  /** In epoch milliseconds. */
  readonly now: number
  readonly idleMinutes: number
}

// Not protected by matching a pin's URL: merely opening a pin's page in a temporary tab would keep
// that tab from ever being archived
const isProtected = (tab: AutoArchiveTab) =>
  tab.isActive || tab.isAudible || tab.isChromePinned || tab.isBoundToPin

const hasBeenIdleLongerThanThreshold = (tab: AutoArchiveTab, criteria: AutoArchiveCriteria) =>
  criteria.now - tab.lastActiveAt > criteria.idleMinutes * 60_000

const toTarget = <T extends AutoArchiveTab>(
  tab: T,
  criteria: AutoArchiveCriteria,
): Option.Option<AutoArchiveTarget<T>> =>
  isProtected(tab) || !hasBeenIdleLongerThanThreshold(tab, criteria)
    ? Option.none()
    : Option.map(tab.spaceId, (spaceId) => ({ tab, spaceId }))

/**
 * Returns the tabs auto archive should close, in input order.
 *
 * Those are the temporary tabs that belong to a Space, aren't protected, and were last active
 * longer ago than the threshold.
 */
export const selectAutoArchiveTargets = <T extends AutoArchiveTab>(
  tabs: ReadonlyArray<T>,
  criteria: AutoArchiveCriteria,
): ReadonlyArray<AutoArchiveTarget<T>> => Array.getSomes(tabs.map((tab) => toTarget(tab, criteria)))

// Archiving can lag the threshold by up to one check interval. An interval only proportional to the
// threshold would stretch the lag to hours for long thresholds, and a short fixed one would keep
// waking the service worker for nothing through a long threshold, so it is proportional and
// clamped at both ends.
// The floor is 1 minute, not the 30 seconds Chrome allows: 30 seconds is finer than a setting in
// minutes needs
const CHECKS_PER_THRESHOLD = 4
const SHORTEST_CHECK_INTERVAL_MINUTES = 1
const LONGEST_CHECK_INTERVAL_MINUTES = 15

export const autoArchiveCheckIntervalMinutes = (idleMinutes: number): number =>
  Number.clamp(idleMinutes / CHECKS_PER_THRESHOLD, {
    minimum: SHORTEST_CHECK_INTERVAL_MINUTES,
    maximum: LONGEST_CHECK_INTERVAL_MINUTES,
  })
