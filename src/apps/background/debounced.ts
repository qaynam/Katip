import { Duration, Effect, Queue, Scope } from "effect"

/**
 * 呼ばれるたびに待ち時間を置き、その間の呼び出しをまとめて 1 回だけ `effect` を実行する。
 *
 * タブの読み込み中は onUpdated が短い間隔で何十回も届くため、そのたびに全ウィンドウの
 * ビューやタブグループを計算し直さないようにする。
 *
 * @returns 実行を予約する Effect。予約は即座に戻り、実行の完了を待たない。
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
            Effect.catchCause((cause) => Effect.logError("遅延実行した処理が失敗した", cause)),
          )
        }),
      ),
    )
    return Queue.offer(requests, "requested").pipe(Effect.asVoid)
  })
