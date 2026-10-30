import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { IdleMinutes } from "#modules/settings"
import { parseIdleMinutesInput, stepIdleMinutes } from "./idle-minutes-input"

describe("入力の読み取り", () => {
  it("前後の空白を除いた 1 以上の整数を受け付ける", () => {
    expect(parseIdleMinutesInput(" 45 ")).toStrictEqual(Result.succeed(45))
  })

  it.each(["", "   "])("空欄 %j は、入力が無いことを理由に受け付けない", (text) => {
    expect(parseIdleMinutesInput(text)).toStrictEqual(Result.fail("Empty"))
  })

  it.each(["0", "-5", "2.5", "abc"])(
    "%s は、1 以上の整数でないことを理由に受け付けない",
    (text) => {
      expect(parseIdleMinutesInput(text)).toStrictEqual(Result.fail("NotPositiveInteger"))
    },
  )
})

describe("ステッパー", () => {
  it.each([
    [360, 365],
    [362, 365],
    [1, 5],
  ])("%i 分から増やすと、次の 5 分刻みの %i 分になる", (from, to) => {
    expect(stepIdleMinutes(IdleMinutes.make(from), "Increment")).toBe(to)
  })

  it.each([
    [360, 355],
    [362, 360],
    [6, 5],
  ])("%i 分から減らすと、前の 5 分刻みの %i 分になる", (from, to) => {
    expect(stepIdleMinutes(IdleMinutes.make(from), "Decrement")).toBe(to)
  })

  it.each([5, 3, 1])("%i 分から減らしても 1 分より短くはならない", (from) => {
    expect(stepIdleMinutes(IdleMinutes.make(from), "Decrement")).toBe(1)
  })
})
