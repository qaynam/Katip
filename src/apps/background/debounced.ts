import { Duration, Effect, Queue, Scope } from "effect"

/**
 * Waits `delay` after each call, then runs `effect` once for all the calls made in the meantime.
 *
 * While a tab loads, onUpdated arrives dozens of times in quick succession; this keeps the views
 * and tab groups of every window from being recomputed for each one.
 *
 * @returns An Effect that schedules a run. It returns at once, without waiting for the run.
 */
export const makeDebounced = <E, R>(
  effect: Effect.Effect<void, E, R>,
  delay: Duration.Input,
): Effect.Effect<Effect.Effect<void>, never, R | Scope.Scope> =>
  Effect.gen(function* () {
    const requests = yield* Queue.sliding<"requested">(1)
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* Queue.take(requests)
          yield* Effect.sleep(delay)
          yield* Queue.clear(requests)
          yield* effect.pipe(
            Effect.catchCause((cause) => Effect.logError("A debounced effect failed", cause)),
          )
        }),
      ),
    )
    return Queue.offer(requests, "requested").pipe(Effect.asVoid)
  })
