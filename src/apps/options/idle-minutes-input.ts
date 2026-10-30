import { Result, Schema } from "effect"
import { IdleMinutes } from "#modules/settings"

export type IdleMinutesProblem = "Empty" | "NotPositiveInteger"

export type StepDirection = "Increment" | "Decrement"

const STEP_MINUTES = 5

const decodeIdleMinutes = Schema.decodeUnknownResult(IdleMinutes)

export const parseIdleMinutesInput = (
  text: string,
): Result.Result<IdleMinutes, IdleMinutesProblem> => {
  const trimmed = text.trim()
  if (trimmed === "") return Result.fail("Empty")
  return Result.mapError(
    decodeIdleMinutes(Number(trimmed)),
    (): IdleMinutesProblem => "NotPositiveInteger",
  )
}

// 1 分ずつでは既定の 360 分から大きく変えるのに何十回も押すことになり、5 分ずつ足すだけでは
// 362 のような半端な値が半端なまま残る。5 分刻みの目盛りへ寄せる
export const stepIdleMinutes = (minutes: IdleMinutes, direction: StepDirection): IdleMinutes =>
  IdleMinutes.make(
    direction === "Increment"
      ? (Math.floor(minutes / STEP_MINUTES) + 1) * STEP_MINUTES
      : Math.max(1, (Math.ceil(minutes / STEP_MINUTES) - 1) * STEP_MINUTES),
  )
