import { Option, Schema } from "effect"

export const BrowserAlarm = Schema.Struct({
  name: Schema.String,
  scheduledTime: Schema.Number,
  periodInMinutes: Schema.OptionFromNullOr(Schema.Number),
})
export type BrowserAlarm = typeof BrowserAlarm.Type

/** 時刻はエポックミリ秒、間隔は分。 */
export type AlarmSchedule =
  | { readonly delayInMinutes: number; readonly periodInMinutes?: number }
  | { readonly periodInMinutes: number }
  | { readonly when: number; readonly periodInMinutes?: number }

export const fromChromeAlarm = (raw: chrome.alarms.Alarm): BrowserAlarm => ({
  name: raw.name,
  scheduledTime: raw.scheduledTime,
  periodInMinutes: Option.fromNullishOr(raw.periodInMinutes),
})
