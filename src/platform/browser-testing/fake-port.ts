import { Deferred, Effect, Option, Predicate } from "effect"
import {
  type BrowserApiError,
  type BrowserPort,
  type HeldStream,
  makeHeldStream,
  PortDisconnectedError,
  type PortSender,
} from "#platform/browser"

// Chrome delivers Port messages as JSON. Passing them through the same conversion lets tests catch
// a value someone forgot to encode (an Option, say) failing to decode on the other side
const viaJson = (message: unknown): unknown =>
  Predicate.isUndefined(message) ? null : JSON.parse(JSON.stringify(message))

/**
 * Makes a connected pair of Ports: `client` is the side that connected, `server` the side that
 * receives it through `runtime.onConnect`. When either disconnects, both `messages` streams end and
 * both `disconnected` effects complete.
 */
export const makePortPair = (
  name: string,
  sender: PortSender,
): { readonly client: BrowserPort; readonly server: BrowserPort } => {
  const toClient = makeHeldStream<unknown>()
  const toServer = makeHeldStream<unknown>()
  const closed = Deferred.makeUnsafe<undefined>()
  const close = () => {
    if (!Deferred.doneUnsafe(closed, Effect.undefined)) return
    toClient.end()
    toServer.end()
  }

  const endpoint = (
    inbox: HeldStream<unknown>,
    outbox: HeldStream<unknown>,
    portSender: Option.Option<PortSender>,
  ): BrowserPort => ({
    name,
    sender: portSender,
    post: (message) =>
      Effect.suspend((): Effect.Effect<void, PortDisconnectedError | BrowserApiError> =>
        Deferred.isDoneUnsafe(closed)
          ? Effect.fail(new PortDisconnectedError({ portName: name }))
          : Effect.sync(() => outbox.push(viaJson(message))),
      ),
    messages: inbox.stream,
    disconnected: Deferred.await(closed),
    disconnect: Effect.sync(close),
  })

  return {
    client: endpoint(toClient, toServer, Option.none()),
    server: endpoint(toServer, toClient, Option.some(sender)),
  }
}
