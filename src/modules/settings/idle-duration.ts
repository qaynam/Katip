import { Array, Order } from "effect"
import { IdleMinutes } from "./settings"

/** 自動アーカイブまでの時間として選べる値（分）。短い順。 */
export const IDLE_MINUTES_CHOICES: ReadonlyArray<IdleMinutes> = [
  30,
  60,
  3 * 60,
  6 * 60,
  12 * 60,
  24 * 60,
  3 * 24 * 60,
  7 * 24 * 60,
].map((minutes) => IdleMinutes.make(minutes))

export interface IdleDuration {
  readonly value: number
  readonly unit: "minute" | "hour" | "day" | "week"
}

const MINUTES_PER = { week: 7 * 24 * 60, day: 24 * 60, hour: 60 } as const

/** 「6 時間」「3 日」のように、割り切れる最も大きい単位で表す。表示の文言は呼び出し側の言語で作る。 */
export const idleDurationOf = (minutes: IdleMinutes): IdleDuration => {
  const unit = (["week", "day", "hour"] as const).find((u) => minutes % MINUTES_PER[u] === 0)
  return unit === undefined
    ? { value: minutes, unit: "minute" }
    : { value: minutes / MINUTES_PER[unit], unit }
}

/**
 * 選択肢に、今の保存値を加えたもの。
 *
 * 以前の版で分単位の任意の値を保存した人もいるので、選択肢に無い値でも選択中として表示できるようにする。
 */
export const idleMinutesChoicesWith = (current: IdleMinutes): ReadonlyArray<IdleMinutes> =>
  IDLE_MINUTES_CHOICES.includes(current)
    ? IDLE_MINUTES_CHOICES
    : Array.sort([...IDLE_MINUTES_CHOICES, current], Order.Number)
