import { Context, Effect, Layer, Match, Option, Ref, Schema, Stream } from "effect"
import { Windows, type BrowserPort, type WindowId } from "#platform/browser"
import { ClientMessage, ServerMessage, type CommandOutcome, type SidebarCommand } from "#protocol"
import { buildSidebarView } from "./sidebar-view-source"

interface Subscriber {
  readonly id: number
  readonly port: BrowserPort
  /** None follows whichever window was focused last, as the development page does. */
  readonly windowId: Option.Option<WindowId>
}

const decodeClientMessage = Schema.decodeUnknownEffect(ClientMessage)
const encodeServerMessage = Schema.encodeEffect(ServerMessage)

const post = (port: BrowserPort, message: ServerMessage) =>
  encodeServerMessage(message).pipe(
    Effect.orDie,
    Effect.flatMap((encoded) => port.post(encoded)),
    Effect.as(true),
    // Not unsubscribed here: a send can fail before the disconnect arrives, and the disconnect
    // cleans the subscription up
    Effect.catch(() => Effect.succeed(false)),
  )

export class SidebarHub extends Context.Service<
  SidebarHub,
  {
    /**
     * Serves a side panel's connection until it disconnects.
     *
     * @param run - Runs a received command. Failures must be returned inside the `CommandOutcome`.
     */
    serve<R>(
      port: BrowserPort,
      run: (command: SidebarCommand) => Effect.Effect<CommandOutcome, never, R>,
    ): Effect.Effect<void, never, R>
    /** Sends every subscribed side panel its view, if it changed since the last one sent. */
    readonly publish: Effect.Effect<void>
    notify(message: string): Effect.Effect<void>
  }
>()("katip/background/SidebarHub") {
  static readonly layer = Layer.effect(
    SidebarHub,
    Effect.gen(function* () {
      const windows = yield* Windows
      // The services that building a view needs are captured here, so publish requires nothing
      // and the list of services doesn't leak into its callers (the debounce and each handler)
      const viewContext =
        yield* Effect.context<Effect.Services<ReturnType<typeof buildSidebarView>>>()
      const subscribers = yield* Ref.make<ReadonlyArray<Subscriber>>([])
      // Sending the whole view every time would keep side panels redrawing nonstop while tabs load
      const lastSent = yield* Ref.make<ReadonlyMap<number, string>>(new Map())
      const nextId = yield* Ref.make(0)

      const resolveWindow = (subscriber: Subscriber) =>
        Option.match(subscriber.windowId, {
          onSome: Effect.succeed,
          onNone: () => Effect.map(windows.getLastFocused, (window) => window.id),
        })

      const publishTo = (subscriber: Subscriber) =>
        Effect.gen(function* () {
          const windowId = yield* resolveWindow(subscriber)
          const view = yield* buildSidebarView(windowId)
          if (Option.isNone(view)) return
          const message: ServerMessage = { _tag: "ViewUpdated", view: view.value }
          const encoded = JSON.stringify(yield* encodeServerMessage(message).pipe(Effect.orDie))
          const previous = (yield* Ref.get(lastSent)).get(subscriber.id)
          if (previous === encoded) return
          if (yield* post(subscriber.port, message)) {
            yield* Ref.update(lastSent, (sent) => new Map(sent).set(subscriber.id, encoded))
          }
        }).pipe(
          Effect.catchCause((cause) => Effect.logWarning("Couldn't send the view", cause)),
          Effect.provideContext(viewContext),
        )

      const publish = Effect.flatMap(Ref.get(subscribers), (all) =>
        Effect.forEach(all, publishTo, { discard: true, concurrency: "unbounded" }),
      )

      const unsubscribe = (id: number) =>
        Effect.andThen(
          Ref.update(subscribers, (all) => all.filter((subscriber) => subscriber.id !== id)),
          Ref.update(lastSent, (sent) => {
            const next = new Map(sent)
            next.delete(id)
            return next
          }),
        )

      const serve = <R>(
        port: BrowserPort,
        run: (command: SidebarCommand) => Effect.Effect<CommandOutcome, never, R>,
      ) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1)
          const handle = (message: ClientMessage) =>
            Match.value(message).pipe(
              Match.tagsExhaustive({
                Subscribe: ({ windowId }) =>
                  Effect.gen(function* () {
                    const subscriber = { id, port, windowId: Option.fromNullishOr(windowId) }
                    yield* unsubscribe(id)
                    yield* Ref.update(subscribers, (all) => [...all, subscriber])
                    yield* publishTo(subscriber)
                  }),
                Run: ({ requestId, command }) =>
                  Effect.flatMap(run(command), (outcome) =>
                    post(port, { _tag: "CommandSettled", requestId, outcome }),
                  ),
                KeepAlive: () => Effect.void,
              }),
            )
          yield* port.messages.pipe(
            Stream.runForEach((raw) =>
              Effect.flatMap(Effect.option(decodeClientMessage(raw)), (message) =>
                Option.match(message, { onNone: () => Effect.void, onSome: handle }),
              ),
            ),
            Effect.ensuring(unsubscribe(id)),
          )
        })

      const notify = (message: string) =>
        Effect.flatMap(Ref.get(subscribers), (all) =>
          Effect.forEach(all, (subscriber) => post(subscriber.port, { _tag: "Notice", message }), {
            discard: true,
          }),
        )

      return SidebarHub.of({ serve, publish, notify })
    }),
  )
}
