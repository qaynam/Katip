import { Effect, type Option, Schema } from "effect"
import type { BrowserApiError, StorageArea } from "#platform/browser"

export interface StoredValue<A> {
  /** 保存値が無い、または形が合わなければ None。 */
  readonly load: Effect.Effect<Option.Option<A>, BrowserApiError>
  save(value: A): Effect.Effect<void, BrowserApiError>
}

export const storedValue = <A, I>(
  area: StorageArea,
  key: string,
  schema: Schema.Codec<A, I>,
): StoredValue<A> => ({
  // 壊れた保存値で機能を止めない。このモジュールの保存値はどれもブックマーク側から
  // 組み立て直せるか、失っても既定値に戻るだけで済む
  load: area
    .getDecoded(key, schema)
    .pipe(Effect.catchTag("StorageDecodeError", () => Effect.succeedNone)),
  save: (value) =>
    Schema.encodeEffect(schema)(value).pipe(
      Effect.orDie,
      Effect.flatMap((encoded) => area.set(key, encoded)),
    ),
})
