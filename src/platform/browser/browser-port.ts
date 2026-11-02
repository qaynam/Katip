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
  /**
   * Whether the connection came through `runtime.onConnectExternal`, that is, from a page outside
   * the extension or from another extension.
   */
  readonly external: boolean
  readonly url: Option.Option<string>
  readonly origin: Option.Option<string>
  readonly tabId: Option.Option<TabId>
}

export interface BrowserPort {
  readonly name: string
  /** `Some` only on accepted connections; a Port this side opened has no sender. */
  readonly sender: Option.Option<PortSender>
  /**
   * Sends a message. Chrome delivers it as JSON, so pass a value encoded with a Schema.
   *
   * @remarks
   * Fails with {@link PortDisconnectedError} once the disconnect has been seen, and with
   * {@link BrowserApiError} when Chrome refuses to send, which includes a peer disconnect that has
   * not been reported yet.
   */
  post(message: unknown): Effect.Effect<void, PortDisconnectedError | BrowserApiError>
  /**
   * Received messages; ends on disconnect.
   *
   * @remarks
   * Messages that arrived before anyone subscribed go to the first subscriber.
   * Values are whatever the peer sent as JSON, so decode them with a Schema before use.
   */
  readonly messages: Stream.Stream<unknown>
  /** Completes on disconnect from either side. */
  readonly disconnected: Effect.Effect<void>
  /** Disconnects; does nothing if already disconnected. */
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

/** The part of `chrome.runtime.Port` that {@link fromChromePort} uses. */
export interface ChromePort {
  readonly name: string
  readonly sender?: chrome.runtime.MessageSender | undefined
  postMessage(message: unknown): void
  disconnect(): void
  readonly onMessage: { addListener(listener: (message: unknown) => void): void }
  readonly onDisconnect: { addListener(listener: () => void): void }
}

/**
 * Wraps a Chrome Port as a {@link BrowserPort}.
 *
 * @remarks
 * Registers the message and disconnect listeners synchronously within this call, so messages that
 * arrive between receiving the Port and subscribing to `messages` are kept.
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
      // Chrome does not fire onDisconnect on the side that disconnects
      port.disconnect()
      markClosed()
    }),
  }
}

export class Ports extends Context.Service<
  Ports,
  {
    /**
     * Connects to another page of this extension, such as from the side panel to the background.
     * Closing the scope disconnects.
     */
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
