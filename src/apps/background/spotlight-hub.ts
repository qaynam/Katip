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

// A reply only fails to send once Spotlight has closed, so a failed reply is dropped
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
     * Serves a Spotlight connection until it disconnects, handling messages one at a time in the
     * order they arrive.
     *
     * @param choose - Opens the chosen result. `windowId` is the window Spotlight was opened over.
     *   Failures must be returned inside the `SpotlightOutcome`.
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
      // The services search needs are captured here, so serve requires only what choose does
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
            Search: ({ requestId, windowId, query, mode }) =>
              findSpotlightResults(windowId, query, mode).pipe(
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
