import { Schema } from "effect"
import type { WindowId } from "#platform/browser"
import { RequestId, type SpotlightClientMessage, SpotlightServerMessage } from "#protocol"
import type { SearchResponse, SpotlightConnection } from "./spotlight-connection"

/** The part of chrome.runtime.Port the connection uses. */
export interface SpotlightPort {
  readonly postMessage: (message: unknown) => void
  readonly disconnect: () => void
  readonly onMessage: { readonly addListener: (listener: (message: unknown) => void) => void }
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void }
}

export interface SpotlightPortConnectionOptions {
  /** May throw, as it does right after the extension reloads. */
  readonly openPort: () => SpotlightPort
  /** The window that opened Spotlight. */
  readonly callerWindowId: WindowId
  /**
   * How long to wait for a search response before resolving to null as if it never arrived.
   * Defaults to 5 seconds.
   */
  readonly searchTimeoutMs?: number
}

export interface SpotlightPortConnection extends SpotlightConnection {
  /** Disconnects, resolving every request still waiting for an answer to null. */
  readonly close: () => void
}

type Settle = (message: SpotlightServerMessage | null) => void

const decodeServerMessage = Schema.decodeUnknownOption(SpotlightServerMessage)

/**
 * Connects to the background through a Port. The Port opens on the first request and, once cut,
 * reopens on the next one, so Spotlight keeps working as the user types on even after the service
 * worker stops and cuts it.
 */
export const createSpotlightPortConnection = (
  options: SpotlightPortConnectionOptions,
): SpotlightPortConnection => {
  const pending = new Map<RequestId, Settle>()
  let port: SpotlightPort | null = null
  let nextRequestId = 1

  const settleAll = () => {
    const settles = [...pending.values()]
    pending.clear()
    for (const settle of settles) settle(null)
  }

  const forget = (lost: SpotlightPort) => {
    if (port !== lost) return
    port = null
    settleAll()
  }

  const open = (): SpotlightPort | null => {
    let opened: SpotlightPort
    try {
      opened = options.openPort()
    } catch {
      return null
    }
    opened.onMessage.addListener((raw) => {
      const decoded = decodeServerMessage(raw)
      if (decoded._tag === "None") return
      const settle = pending.get(decoded.value.requestId)
      pending.delete(decoded.value.requestId)
      settle?.(decoded.value)
    })
    opened.onDisconnect.addListener(() => forget(opened))
    port = opened
    return opened
  }

  // Posting can fail before the disconnect is reported, so a failed post reconnects once and
  // tries again
  const post = (message: SpotlightClientMessage): boolean => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = port ?? open()
      if (current === null) return false
      try {
        current.postMessage(message)
        return true
      } catch {
        forget(current)
      }
    }
    return false
  }

  const ask = (
    message: (requestId: RequestId) => SpotlightClientMessage,
    timeoutMs: number | null,
  ): Promise<SpotlightServerMessage | null> => {
    const requestId = RequestId.make(nextRequestId++)
    return new Promise((resolve) => {
      // Not registered before posting: a post that fails on a stale port settles everything
      // waiting on that port, and this request would be settled with null even though it then
      // goes out on the new port. Replies arrive asynchronously, so registering after is in time
      if (!post(message(requestId))) {
        resolve(null)
        return
      }
      // A request the background can't read is dropped with neither a response nor a disconnect,
      // which would leave Spotlight loading forever
      const timer =
        timeoutMs === null
          ? undefined
          : setTimeout(() => {
              pending.delete(requestId)
              resolve(null)
            }, timeoutMs)
      pending.set(requestId, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
    })
  }

  return {
    search: async (query, mode) => {
      const reply = await ask(
        (requestId) => ({
          _tag: "Search",
          requestId,
          windowId: options.callerWindowId,
          query,
          mode,
        }),
        options.searchTimeoutMs ?? 5_000,
      )
      return reply?._tag === "SearchResults"
        ? ({ results: reply.results, spaceTheme: reply.spaceTheme } satisfies SearchResponse)
        : null
    },
    // No time limit: opening can queue behind other work in the background, and a limit would
    // report a failure for something that did open
    choose: async (result) => {
      const reply = await ask(
        (requestId) => ({
          _tag: "Choose",
          requestId,
          windowId: options.callerWindowId,
          result,
        }),
        null,
      )
      return reply?._tag === "ChoiceSettled" ? reply.outcome : null
    },
    close: () => {
      const current = port
      port = null
      current?.disconnect()
      settleAll()
    },
  }
}
