import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { describeElapsed } from "./elapsed-time"

const now = new Date(2026, 9, 30, 12, 0).getTime()
const minutes = (value: number) => value * 60_000
const en = makeTranslator("en")
const ja = makeTranslator("ja")

describe("describeElapsed", () => {
  it("describes less than a minute ago as just now", () => {
    expect(describeElapsed(now - 59_000, now, en)).toBe("Just now")
  })

  it("describes less than an hour in minutes and less than a day in hours", () => {
    expect(describeElapsed(now - minutes(5), now, en)).toBe("5 minutes ago")
    expect(describeElapsed(now - minutes(150), now, en)).toBe("2 hours ago")
  })

  it("describes less than a week in days", () => {
    expect(describeElapsed(now - minutes(60 * 24 * 3), now, en)).toBe("3 days ago")
  })

  it("shows the date for a week or more ago", () => {
    expect(describeElapsed(new Date(2026, 9, 1).getTime(), now, en)).toBe("10/1")
  })

  it("describes a moment in the future from clock skew as just now", () => {
    expect(describeElapsed(now + minutes(3), now, en)).toBe("Just now")
  })

  it("uses the singular and plural forms of the display language", () => {
    expect(describeElapsed(now - minutes(1), now, en)).toBe("1 minute ago")
    expect(describeElapsed(now - minutes(5), now, en)).toBe("5 minutes ago")
  })

  it("uses the wording of the display language", () => {
    expect(describeElapsed(now - 59_000, now, ja)).toBe("たった今")
    expect(describeElapsed(now - minutes(5), now, ja)).toBe("5 分前")
  })
})
