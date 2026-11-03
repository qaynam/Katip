import type { Translator } from "#modules/i18n"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const units = [
  ["year", YEAR_MS],
  ["month", MONTH_MS],
  ["day", DAY_MS],
  ["hour", HOUR_MS],
  ["minute", MINUTE_MS],
] as const

/** How long before `now` `then` is, rounded down in the largest unit that fits. */
export const relativeTimeLabel = (then: number, now: number, translator: Translator): string => {
  const elapsed = Math.max(0, now - then)
  const unit = units.find(([, unitMs]) => elapsed >= unitMs)
  if (unit === undefined) return translator.t("spotlight.time.justNow")
  const [name, unitMs] = unit
  return translator.relativeTime(-Math.floor(elapsed / unitMs), name)
}
