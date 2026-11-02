import { Effect, type Option, Schema } from "effect"
import type { BrowserApiError, StorageArea } from "#platform/browser"

export interface StoredValue<A> {
  /** None when nothing is saved or the saved value doesn't match the schema. */
  readonly load: Effect.Effect<Option.Option<A>, BrowserApiError>
  save(value: A): Effect.Effect<void, BrowserApiError>
}

export const storedValue = <A, I>(
  area: StorageArea,
  key: string,
  schema: Schema.Codec<A, I>,
): StoredValue<A> => ({
  // Not failing on a broken saved value: every value this module saves can either be rebuilt
  // from the bookmarks or just falls back to its default when lost
  load: area
    .getDecoded(key, schema)
    .pipe(Effect.catchTag("StorageDecodeError", () => Effect.succeedNone)),
  save: (value) =>
    Schema.encodeEffect(schema)(value).pipe(
      Effect.orDie,
      Effect.flatMap((encoded) => area.set(key, encoded)),
    ),
})
