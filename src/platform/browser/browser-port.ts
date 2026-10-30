import { Context, Deferred, Effect, Layer, Option, Schema, Scope, Stream } from "effect"
import { BrowserApiError } from "./browser-api-error"
import { nonEmptyString, tabIdFrom } from "./chrome-values"
import { makeHeldStream } from "./held-stream"
import type { TabId } from "./ids"

export class PortDisconnectedError extends Schema.TaggedError<PortDisconnectedError>()(
  "PortDisconnectedError",
  { portName: Schema.String },
) {}

export interface PortSender {
  /** `runtime.onConnectExternal` 経由、つまり拡張の外のページや他の拡張からの接続か。 */
  readonly external: boolean
  readonly url: Option.Option<string>
  readonly origin: Option.Option<string>
  readonly tabId: Option.Option<TabId>
}

export interface BrowserPort {
  readonly name: string
  /** 受け取った接続でだけ `Some`。自分から接続した Port には送信元が無い。 */
  readonly sender: Option.Option<PortSender>
  /**
   * メッセージを送る。Chrome は JSON にして届けるので、Schema で encode した値を渡すこと。
   *
   * @remarks
   * 切断を検知済みなら {@link PortDisconnectedError}。Chrome が送信を拒んだ場合は
   * {@link BrowserApiError}（相手の切断がまだ通知されていない場合もこちらになる）。
   */
  post(message: unknown): Effect.Effect<void, PortDisconnectedError | BrowserApiError>
  /**
   * 受信したメッセージ。切断されると終わる。
   *
   * @remarks
   * 購読を始める前に届いていたメッセージは、最初の購読者が受け取る。
   * 値は相手が JSON で送ったものなので、Schema で decode してから使う。
   */
  readonly messages: Stream.Stream<unknown>
  /** 相手から・自分からを問わず、切断されたときに完了する。 */
  readonly disconnected: Effect.Effect<void>
  /** 切断する。切断済みなら何もしない。 */
  readonly disconnect: Effect.Effect<void>
}

export const fromChromeMessageSender = (
  raw: chrome.runtime.MessageSender | undefined,
  external: boolean,
): PortSender => ({
  external,
  url: nonEmptyString(raw?.url),
  origin: nonEmptyString(raw?.origin),
  tabId: tabIdFrom(raw?.tab?.id),
})

/** {@link fromChromePort} が使う `chrome.runtime.Port` の部分。 */
export interface ChromePort {
  readonly name: string
  readonly sender?: chrome.runtime.MessageSender | undefined
  postMessage(message: unknown): void
  disconnect(): void
  readonly onMessage: { addListener(listener: (message: unknown) => void): void }
  readonly onDisconnect: { addListener(listener: () => void): void }
}

/**
 * Chrome の Port を {@link BrowserPort} に包む。
 *
 * @remarks
 * 受信と切断のリスナーはこの呼び出しの中で同期的に登録する。
 * Port を受け取ってから `messages` を購読するまでに届いたメッセージも失わない。
 */
export const fromChromePort = (
  port: ChromePort,
  sender: Option.Option<PortSender>,
): BrowserPort => {
  const inbox = makeHeldStream<unknown>()
  const closed = Deferred.makeUnsafe<undefined>()
  const markClosed = () => {
    if (Deferred.doneUnsafe(closed, Effect.undefined)) inbox.end()
  }
  port.onMessage.addListener((message) => inbox.push(message))
  port.onDisconnect.addListener(markClosed)

  return {
    name: port.name,
    sender,
    post: (message) =>
      Effect.suspend((): Effect.Effect<void, PortDisconnectedError | BrowserApiError> =>
        Deferred.isDoneUnsafe(closed)
          ? Effect.fail(new PortDisconnectedError({ portName: port.name }))
          : Effect.try({
              try: () => port.postMessage(message),
              catch: (cause) => new BrowserApiError({ api: "runtime.Port.postMessage", cause }),
            }),
      ),
    messages: inbox.stream,
    disconnected: Deferred.await(closed),
    disconnect: Effect.sync(() => {
      if (Deferred.isDoneUnsafe(closed)) return
      // Chrome は自分から切断した側には onDisconnect を通知しない
      port.disconnect()
      markClosed()
    }),
  }
}

export class Ports extends Context.Service<
  Ports,
  {
    /** 同じ拡張の別のページ（sidepanel から background など）へ接続する。スコープを閉じると切断する。 */
    connect(name: string): Effect.Effect<BrowserPort, BrowserApiError, Scope.Scope>
  }
>()("katip/platform/browser/Ports") {
  static readonly layer = Layer.succeed(
    Ports,
    Ports.of({
      connect: (name) =>
        Effect.acquireRelease(
          Effect.try({
            try: () => fromChromePort(chrome.runtime.connect({ name }), Option.none()),
            catch: (cause) => new BrowserApiError({ api: "runtime.connect", cause }),
          }),
          (port) => port.disconnect,
        ),
    }),
  )
}
