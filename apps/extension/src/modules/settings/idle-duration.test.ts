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
  ] as const)(
    "expresses %d minutes in the largest unit that divides them evenly",
    (minutes, expected) => {
      expect(idleDurationOf(IdleMinutes.make(minutes))).toStrictEqual(expected)
    },
  )

  it("keeps minutes that hours don't divide evenly in minutes", () => {
    expect(idleDurationOf(IdleMinutes.make(90))).toStrictEqual({ value: 90, unit: "minute" })
  })
})

describe("idleMinutesChoicesWith", () => {
  it("returns the choices as they are when the value is one of them", () => {
    expect(idleMinutesChoicesWith(IdleMinutes.make(360))).toStrictEqual(IDLE_MINUTES_CHOICES)
  })

  it("adds a stored value that isn't a choice in its place, shortest first, so it isn't lost", () => {
    const choices = idleMinutesChoicesWith(IdleMinutes.make(90))

    expect(choices.slice(0, 3)).toStrictEqual([30, 60, 90])
  })
})
