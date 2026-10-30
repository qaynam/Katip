import { Effect, Option, Schema, SynchronizedRef } from "effect"
import type { BrowserApiError, StorageArea } from "#platform/browser"

export interface PersistedRef<A> {
  /** 起動時に storage に値があったか。無ければ初期値から始まっている。 */
  readonly wasStored: boolean
  readonly get: Effect.Effect<A>
  /** 新しい値を保存してから反映する。保存に失敗したら値は変わらない。 */
  updateEffect<E, R>(
    f: (value: A) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | BrowserApiError, R>
  update(f: (value: A) => A): Effect.Effect<A, BrowserApiError>
}

/**
 * storage の 1 キーをメモリに載せ、更新を直列化して書き戻す。
 *
 * @remarks
 * 書き手が 1 つのページ（background）に限られる値に使う。他のページからの書き込みは取り込まない。
 * 保存値が無い・形が合わない場合は `initial` から始める。
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
        Effect.logWarning("保存値を読めなかったので初期値から始める", error).pipe(
          Effect.as(Option.none<A>()),
        ),
      ),
    )
  const ref = yield* SynchronizedRef.make(Option.getOrElse(stored, options.initial))
  const encode = Schema.encodeEffect(options.schema)
  const save = (value: A) =>
    encode(value).pipe(
      // Codec の Type から作った値の encode は失敗しない。失敗するならスキーマの定義の誤り
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
