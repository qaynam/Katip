import { Context, Effect, Layer } from "effect"
import { type AlarmSchedule, type BrowserAlarm, fromChromeAlarm } from "./alarm"
import { type BrowserApiError, callChrome } from "./browser-api-error"

export class Alarms extends Context.Service<
  Alarms,
  {
    /** Replaces any alarm with the same name. */
    create(name: string, schedule: AlarmSchedule): Effect.Effect<void, BrowserApiError>
    /** @returns Whether there was an alarm to clear. */
    clear(name: string): Effect.Effect<boolean, BrowserApiError>
    readonly getAll: Effect.Effect<ReadonlyArray<BrowserAlarm>, BrowserApiError>
  }
>()("katip/platform/browser/Alarms") {
  static readonly layer = Layer.succeed(
    Alarms,
    Alarms.of({
      create: (name, schedule) =>
        callChrome("alarms.create", () => chrome.alarms.create(name, { ...schedule })),
      clear: (name) => callChrome("alarms.clear", () => chrome.alarms.clear(name)),
      getAll: Effect.map(
        callChrome("alarms.getAll", () => chrome.alarms.getAll()),
        (raws) => raws.map(fromChromeAlarm),
      ),
    }),
  )
}
