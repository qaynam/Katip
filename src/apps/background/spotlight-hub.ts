import { Context, Effect, Layer, Match, Option, Schema, Stream } from "effect"
import type { BrowserPort, WindowId } from "#platform/browser"
import {
  SpotlightClientMessage,
  type SpotlightOutcome,
  type SpotlightResult,
  SpotlightServerMessage,
} from "#protocol"
import { findSpotlightResults } from "./spotlight-results"

const decodeClientMessage = Schema.decodeUnknownEffect(SpotlightClientMessage)
const encodeServerMessage = Schema.encodeEffect(SpotlightServerMessage)

// 送れないのは Spotlight が閉じられたときなので、送れなかった応答は捨てる
const reply = (port: BrowserPort, message: SpotlightServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.ignore,
  )

export class SpotlightHub extends Context.Service<
  SpotlightHub,
  {
    /**
     * Spotlight からの接続を、切断されるまで受け持つ。メッセージは届いた順に 1 つずつ処理する。
     *
     * @param choose - 選ばれた候補を開く。`windowId` は Spotlight を開いたウィンドウ。
     *   失敗は `SpotlightOutcome` に含めて返すこと。
     */
    serve<R>(
      port: BrowserPort,
      choose: (
        windowId: WindowId,
        result: SpotlightResult,
      ) => Effect.Effect<SpotlightOutcome, never, R>,
    ): Effect.Effect<void, never, R>
  }
>()("katip/background/SpotlightHub") {
  static readonly layer = Layer.effect(
    SpotlightHub,
    Effect.gen(function* () {
      // 検索に要るサービスを構築時に捕まえ、serve の要求を choose の分だけにする
      const searchContext =
        yield* Effect.context<Effect.Services<ReturnType<typeof findSpotlightResults>>>()

      const serve = <R>(
        port: BrowserPort,
        choose: (
          windowId: WindowId,
          result: SpotlightResult,
        ) => Effect.Effect<SpotlightOutcome, never, R>,
      ) => {
        const handle = (message: SpotlightClientMessage) =>
          Match.valueTags(message, {
            Search: ({ requestId, windowId, query }) =>
              findSpotlightResults(windowId, query).pipe(
                Effect.provideContext(searchContext),
                Effect.flatMap(({ results, spaceTheme }) =>
                  reply(port, { _tag: "SearchResults", requestId, results, spaceTheme }),
                ),
              ),
            Choose: ({ requestId, windowId, result }) =>
              Effect.flatMap(choose(windowId, result), (outcome) =>
                reply(port, { _tag: "ChoiceSettled", requestId, outcome }),
              ),
          })
        return port.messages.pipe(
          Stream.runForEach((raw) =>
            Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
              Option.match(message, { onNone: () => Effect.void, onSome: handle }),
            ),
          ),
        )
      }

      return SpotlightHub.of({ serve })
    }),
  )
}
