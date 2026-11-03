import { Effect, Option, Schema, SynchronizedRef } from "effect"
import type { BrowserApiError, StorageArea } from "#platform/browser"

export interface PersistedRef<A> {
  /** Whether storage held a value at startup; if not, the ref started from the initial value. */
  readonly wasStored: boolean
  readonly get: Effect.Effect<A>
  /** Saves the new value before applying it; if saving fails, the value stays unchanged. */
  updateEffect<E, R>(
    f: (value: A) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | BrowserApiError, R>
  update(f: (value: A) => A): Effect.Effect<A, BrowserApiError>
}

/**
 * Holds one storage key in memory and writes updates back one at a time.
 *
 * @remarks
 * For values written by a single page (the background) only; writes from other pages are not
 * picked up. Starts from `initial` when nothing is stored or the stored value does not decode.
 */
export const makePersistedRef = Effect.fnUntraced(function* <A, I>(options: {
  readonly area: StorageArea
  readonly key: string
  readonly schema: Schema.Codec<A, I>
  readonly initial: () => A
}) {
  const stored = yield* options.area
    .getDecoded(options.key, options.schema)
    .pipe(
      Effect.catchTag("StorageDecodeError", (error) =>
        Effect.logWarning(
          "Could not decode the stored value; starting from the initial value",
          error,
        ).pipe(Effect.as(Option.none<A>())),
      ),
    )
  const ref = yield* SynchronizedRef.make(Option.getOrElse(stored, options.initial))
  const encode = Schema.encodeEffect(options.schema)
  const save = (value: A) =>
    encode(value).pipe(
      // Not a typed failure: encoding a value of the Codec's Type cannot fail unless the schema
      // itself is wrong
      Effect.orDie,
      Effect.flatMap((encoded) => options.area.set(options.key, encoded)),
      Effect.as(value),
    )
  const updateEffect = <E, R>(f: (value: A) => Effect.Effect<A, E, R>) =>
    SynchronizedRef.updateAndGetEffect(ref, (value) => Effect.flatMap(f(value), save))

  return {
    wasStored: Option.isSome(stored),
    get: SynchronizedRef.get(ref),
    updateEffect,
    update: (f) => updateEffect((value) => Effect.succeed(f(value))),
  } satisfies PersistedRef<A>
})
