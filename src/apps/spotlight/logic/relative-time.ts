import { strings } from "../strings"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

/** `then` が `now` からどれだけ前かを、最も大きい単位で切り捨てて表す。 */
export const relativeTimeLabel = (then: number, now: number): string => {
  const elapsed = Math.max(0, now - then)
  if (elapsed < MINUTE_MS) return strings.elapsed.justNow
  if (elapsed < HOUR_MS) return strings.elapsed.minutes(Math.floor(elapsed / MINUTE_MS))
  if (elapsed < DAY_MS) return strings.elapsed.hours(Math.floor(elapsed / HOUR_MS))
  if (elapsed < MONTH_MS) return strings.elapsed.days(Math.floor(elapsed / DAY_MS))
  if (elapsed < YEAR_MS) return strings.elapsed.months(Math.floor(elapsed / MONTH_MS))
  return strings.elapsed.years(Math.floor(elapsed / YEAR_MS))
}
