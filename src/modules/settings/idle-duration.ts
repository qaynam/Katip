import { Array, Order } from "effect"
import { IdleMinutes } from "./settings"

/** The idle times, in minutes, that can be chosen for auto archive. Shortest first. */
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

/**
 * Expresses the minutes in the largest unit that divides them evenly, such as 6 hours or 3 days.
 * The caller writes the text in its own language.
 */
export const idleDurationOf = (minutes: IdleMinutes): IdleDuration => {
  const unit = (["week", "day", "hour"] as const).find((u) => minutes % MINUTES_PER[u] === 0)
  return unit === undefined
    ? { value: minutes, unit: "minute" }
    : { value: minutes / MINUTES_PER[unit], unit }
}

/**
 * The choices with the current stored value added among them, keeping them shortest first.
 *
 * Earlier versions let people save any number of minutes, so a value that isn't one of the choices
 * still has to be shown as selected.
 */
export const idleMinutesChoicesWith = (current: IdleMinutes): ReadonlyArray<IdleMinutes> =>
  IDLE_MINUTES_CHOICES.includes(current)
    ? IDLE_MINUTES_CHOICES
    : Array.sort([...IDLE_MINUTES_CHOICES, current], Order.Number)
