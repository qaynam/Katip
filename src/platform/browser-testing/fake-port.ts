import { Deferred, Effect, Option, Predicate } from "effect"
import {
  type BrowserApiError,
  type BrowserPort,
  type HeldStream,
  makeHeldStream,
  PortDisconnectedError,
  type PortSender,
} from "#platform/browser"

// Chrome は Port のメッセージを JSON にして届ける。同じ変換を通し、encode し忘れた値（Option など）が
// 相手側で decode できなくなることをテストで再現する
const viaJson = (message: unknown): unknown =>
  Predicate.isUndefined(message) ? null : JSON.parse(JSON.stringify(message))

/**
 * つながった Port の組を作る。`client` は接続した側、`server` は `runtime.onConnect` で受け取る側。
 * どちらかが切断すると、両方の `messages` が終わり `disconnected` が完了する。
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
