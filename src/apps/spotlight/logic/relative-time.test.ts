import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { relativeTimeLabel } from "./relative-time"

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const japanese = makeTranslator("ja")

describe("相対時刻", () => {
  it.each([
    ["1 分たっていなければ「たった今」", 59 * 1000, "たった今"],
    ["1 時間たっていなければ分で", 5 * MINUTE, "5 分前"],
    ["1 日たっていなければ時間で", 3 * HOUR + 59 * MINUTE, "3 時間前"],
    ["30 日たっていなければ日で", 3 * DAY, "3 日前"],
    ["1 年たっていなければ月で", 65 * DAY, "2 か月前"],
    ["1 年以上なら年で", 800 * DAY, "2 年前"],
  ])("%s表す", (_, elapsed, label) => {
    expect(relativeTimeLabel(NOW - elapsed, NOW, japanese)).toBe(label)
  })

  it("時計のずれで未来の時刻になっていても「たった今」と表す", () => {
    expect(relativeTimeLabel(NOW + 5 * MINUTE, NOW, japanese)).toBe("たった今")
  })
})

describe("相対時刻の言語", () => {
  it("表示する言語の言い回しで表す", () => {
    expect(relativeTimeLabel(NOW - 3 * DAY, NOW, makeTranslator("en"))).toBe("3 days ago")
  })

  it("1 分たっていないときも表示する言語で表す", () => {
    expect(relativeTimeLabel(NOW, NOW, makeTranslator("en"))).toBe("Just now")
  })
})
