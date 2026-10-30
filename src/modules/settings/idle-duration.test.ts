import { describe, expect, it } from "vitest"
import { IDLE_MINUTES_CHOICES, idleDurationOf, idleMinutesChoicesWith } from "./idle-duration"
import { IdleMinutes } from "./settings"

describe("idleDurationOf", () => {
  it.each([
    [30, { value: 30, unit: "minute" }],
    [60, { value: 1, unit: "hour" }],
    [360, { value: 6, unit: "hour" }],
    [1440, { value: 1, unit: "day" }],
    [4320, { value: 3, unit: "day" }],
    [10080, { value: 1, unit: "week" }],
  ] as const)("%d 分は、割り切れる最も大きい単位で表す", (minutes, expected) => {
    expect(idleDurationOf(IdleMinutes.make(minutes))).toStrictEqual(expected)
  })

  it("時間で割り切れない分数は分のまま表す", () => {
    expect(idleDurationOf(IdleMinutes.make(90))).toStrictEqual({ value: 90, unit: "minute" })
  })
})

describe("idleMinutesChoicesWith", () => {
  it("選択肢に含まれる値なら、選択肢をそのまま返す", () => {
    expect(idleMinutesChoicesWith(IdleMinutes.make(360))).toStrictEqual(IDLE_MINUTES_CHOICES)
  })

  it("選択肢に無い保存値は、失わないよう短い順の位置に加える", () => {
    const choices = idleMinutesChoicesWith(IdleMinutes.make(90))

    expect(choices.slice(0, 3)).toStrictEqual([30, 60, 90])
  })
})
