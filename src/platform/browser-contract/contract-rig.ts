import { Context, Effect, Layer, Ref, Stream } from "effect"
import { type BrowserEvent, BrowserEvents, Tabs } from "#platform/browser"

const QUIET_PERIOD = "30 millis"

/** 契約の場面を動かす環境（本物の Chrome か fake か）ごとに違う部分。 */
export class ContractRig extends Context.Service<
  ContractRig,
  {
    /**
     * 前回取り出してから届いたブラウザのイベントを、届いた順に取り出す。
     * それまでに終えた API 呼び出しが起こしたイベントは、すべて含んでいなければならない。
     */
    readonly takeEvents: Effect.Effect<ReadonlyArray<BrowserEvent>>
  }
>()("katip/platform/browser-contract/ContractRig") {
  /** 本物の Chrome のイベントを、購読を始めてから溜めて渡す。 */
  static readonly live = Layer.effect(
    ContractRig,
    Effect.gen(function* () {
      const tabs = yield* Tabs
      const received = yield* Ref.make<ReadonlyArray<BrowserEvent>>([])
      yield* (yield* BrowserEvents).events.pipe(
        Stream.runForEach((event) => Ref.update(received, (log) => [...log, event])),
        Effect.forkScoped,
      )
      // 呼び出しの応答より先にその呼び出しのイベントが届くことは確かめたが、それに頼り切ると
      // 遅れて届くイベントを次の場面のものとして数えてしまう。往復を挟んで、届く数が
      // 増えなくなるまで待つ
      const settle: Effect.Effect<void> = Effect.gen(function* () {
        const before = (yield* Ref.get(received)).length
        yield* Effect.ignore(tabs.query({}))
        yield* Effect.sleep(QUIET_PERIOD)
        if ((yield* Ref.get(received)).length !== before) yield* settle
      })
      return ContractRig.of({ takeEvents: Effect.andThen(settle, Ref.getAndSet(received, [])) })
    }),
  )
}
