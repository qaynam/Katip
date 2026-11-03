import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { relativeTimeLabel } from "./relative-time"

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const english = makeTranslator("en")

describe("relativeTimeLabel", () => {
  it.each([
    ["under a minute as just now", 59 * 1000, "Just now"],
    ["under an hour in minutes", 5 * MINUTE, "5 minutes ago"],
    ["under a day in whole hours", 3 * HOUR + 59 * MINUTE, "3 hours ago"],
    ["under 30 days in days", 3 * DAY, "3 days ago"],
    ["under a year in months", 65 * DAY, "2 months ago"],
    ["a year or more in years", 800 * DAY, "2 years ago"],
  ])("writes %s", (_, elapsed, label) => {
    expect(relativeTimeLabel(NOW - elapsed, NOW, english)).toBe(label)
  })

  it("writes a time in the future, as from a clock that is off, as just now", () => {
    expect(relativeTimeLabel(NOW + 5 * MINUTE, NOW, english)).toBe("Just now")
  })
})

describe("relativeTimeLabel's wording", () => {
  it("follows the display language", () => {
    expect(relativeTimeLabel(NOW - 3 * DAY, NOW, makeTranslator("ja"))).toBe("3 日前")
  })

  it("follows the display language for just now too", () => {
    expect(relativeTimeLabel(NOW, NOW, makeTranslator("ja"))).toBe("たった今")
  })
})
