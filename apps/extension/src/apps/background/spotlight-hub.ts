import { Context, Effect, Layer, Match, Option, Ref, Schema, Stream } from "effect"
import type { BrowserPort, WindowId } from "#platform/browser"
import {
  SpotlightClientMessage,
  type SpotlightOutcome,
  type SpotlightResult,
  type SpotlightTarget,
  SpotlightServerMessage,
} from "#protocol"
import { findSpotlightResults, readRecentHistory } from "./spotlight-results"

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
     * order they arrive. A search that a later one on the connection replaced before its turn came
     * goes unanswered.
     *
     * @param choose - Opens the chosen result. `windowId` is the window Spotlight was opened over.
     *   Failures must be returned inside the `SpotlightOutcome`.
     */
    serve<R>(
      port: BrowserPort,
      choose: (
        windowId: WindowId,
        result: SpotlightResult,
        target: SpotlightTarget,
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
          target: SpotlightTarget,
        ) => Effect.Effect<SpotlightOutcome, never, R>,
      ) =>
        // Read for each Spotlight opened rather than kept between them, which would leave out the
        // pages visited since
        Effect.flatMap(
          Effect.all([Effect.cached(readRecentHistory), Ref.make(0)]),
          ([recentHistory, searchesArrived]) => {
            const handle = (message: SpotlightClientMessage) =>
              Match.valueTags(message, {
                Search: ({ requestId, windowId, query, mode }) =>
                  findSpotlightResults(windowId, query, mode, recentHistory).pipe(
                    Effect.provideContext(searchContext),
                    Effect.flatMap(({ results, spaceTheme }) =>
                      reply(port, { _tag: "SearchResults", requestId, results, spaceTheme }),
                    ),
                  ),
                Choose: ({ requestId, windowId, result, target }) =>
                  Effect.flatMap(choose(windowId, result, target), (outcome) =>
                    reply(port, { _tag: "ChoiceSettled", requestId, outcome }),
                  ),
              })
            const arrive = Effect.fnUntraced(function* (raw: unknown) {
              const message = yield* Effect.option(decodeClientMessage(raw))
              if (Option.isNone(message) || message.value._tag !== "Search") {
                return { message, searchNumber: null }
              }
              return {
                message,
                searchNumber: yield* Ref.updateAndGet(searchesArrived, (n) => n + 1),
              }
            })
            // Not every search is answered in turn: over a long history each takes a tenth of a
            // second or more, so the searches typed meanwhile would queue up, and the answer to
            // what was typed last, the only one Spotlight shows, would come a second or more late
            const isReplaced = (searchNumber: number | null) =>
              Effect.map(
                Ref.get(searchesArrived),
                (arrived) => searchNumber !== null && searchNumber < arrived,
              )
            return port.messages.pipe(
              Stream.mapEffect(arrive),
              // Read ahead of the answers: read only as each turn came, the later searches would
              // still be unread, and no search would look replaced
              Stream.buffer({ capacity: "unbounded" }),
              Stream.runForEach(({ message, searchNumber }) =>
                Effect.flatMap(isReplaced(searchNumber), (replaced) =>
                  replaced
                    ? Effect.void
                    : Option.match(message, { onNone: () => Effect.void, onSome: handle }),
                ),
              ),
            )
          },
        )

      return SpotlightHub.of({ serve })
    }),
  )
}
