const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const monthDay = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" })

export const describeElapsed = (since: number, now: number): string => {
  const elapsed = Math.max(0, now - since)
  if (elapsed < MINUTE_MS) return "たった今"
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} 分前`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} 時間前`
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)} 日前`
  return monthDay.format(since)
}
