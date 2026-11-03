import type { Translator } from "#modules/i18n"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Describes how long ago a moment was, like "5 minutes ago". A week or more ago shows the
 * month and day instead.
 */
export const describeElapsed = (since: number, now: number, translator: Translator): string => {
  const elapsed = Math.max(0, now - since)
  if (elapsed < MINUTE_MS) return translator.t("sidepanel.time.justNow")
  if (elapsed < HOUR_MS) return translator.relativeTime(-Math.floor(elapsed / MINUTE_MS), "minute")
  if (elapsed < DAY_MS) return translator.relativeTime(-Math.floor(elapsed / HOUR_MS), "hour")
  if (elapsed < 7 * DAY_MS) return translator.relativeTime(-Math.floor(elapsed / DAY_MS), "day")
  return new Intl.DateTimeFormat(translator.languageTag, {
    month: "numeric",
    day: "numeric",
  }).format(since)
}
