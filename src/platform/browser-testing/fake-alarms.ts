import { Array, Clock, Effect, Option, Ref, Semaphore } from "effect"
import { type AlarmSchedule, Alarms, type BrowserAlarm, BrowserApiError } from "#platform/browser"
import { chromeCall, type FakeWorld } from "./fake-world"

export interface FakeAlarms {
  readonly service: Alarms["Service"]
  /** アラームを鳴らす。一度きりのアラームは消え、繰り返しのアラームは次の時刻に進む。 */
  readonly fire: (name: string) => Effect.Effect<void, BrowserApiError>
}

const minutesInMillis = (minutes: number) => minutes * 60_000

const firstScheduledTime = (schedule: AlarmSchedule, now: number): number => {
  if ("when" in schedule) return schedule.when
  if ("delayInMinutes" in schedule) return now + minutesInMillis(schedule.delayInMinutes)
  return now + minutesInMillis(schedule.periodInMinutes)
}

export const makeFakeAlarms = Effect.fnUntraced(function* (world: FakeWorld) {
  const alarms = yield* Ref.make<ReadonlyArray<BrowserAlarm>>([])
  const without = (name: string) => (current: ReadonlyArray<BrowserAlarm>) =>
    current.filter((alarm) => alarm.name !== name)

  const service = Alarms.of({
    create: (name, schedule) =>
      chromeCall(
        world,
        "alarms.create",
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          Ref.update(alarms, (current) => [
            ...without(name)(current),
            {
              name,
              scheduledTime: firstScheduledTime(schedule, now),
              periodInMinutes: Option.fromUndefinedOr(schedule.periodInMinutes),
            },
          ]),
        ),
      ),
    clear: (name) =>
      chromeCall(
        world,
        "alarms.clear",
        Ref.modify(alarms, (current) => [
          current.some((alarm) => alarm.name === name),
          without(name)(current),
        ]),
      ),
    getAll: chromeCall(world, "alarms.getAll", Ref.get(alarms)),
  })

  const fire: FakeAlarms["fire"] = (name) =>
    Semaphore.withPermits(
      world.lock,
      1,
    )(
      Effect.gen(function* () {
        const alarm = Array.findFirst(
          yield* Ref.get(alarms),
          (candidate) => candidate.name === name,
        )
        if (Option.isNone(alarm)) {
          return yield* new BrowserApiError({
            api: "alarms.onAlarm",
            cause: new Error(`No alarm named ${name}`),
          })
        }
        const rescheduled = Option.map(alarm.value.periodInMinutes, (period) => ({
          ...alarm.value,
          scheduledTime: alarm.value.scheduledTime + minutesInMillis(period),
        }))
        yield* Ref.update(alarms, (current) => [
          ...without(name)(current),
          ...Option.toArray(rescheduled),
        ])
        yield* world.publish([{ _tag: "AlarmFired", alarm: alarm.value }])
      }),
    )

  return { service, fire } satisfies FakeAlarms
})
