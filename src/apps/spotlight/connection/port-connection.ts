import { Schema } from "effect"
import type { WindowId } from "#platform/browser"
import {
  RequestId,
  type SpotlightClientMessage,
  type SpotlightOutcome,
  SpotlightServerMessage,
} from "#protocol"
import { strings } from "../strings"
import type { SearchResponse, SpotlightConnection } from "./spotlight-connection"

/** chrome.runtime.Port のうち、接続が使う部分だけ。 */
export interface SpotlightPort {
  readonly postMessage: (message: unknown) => void
  readonly disconnect: () => void
  readonly onMessage: { readonly addListener: (listener: (message: unknown) => void) => void }
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void }
}

export interface SpotlightPortConnectionOptions {
  /** 例外を投げてもよい（拡張の再読み込み直後など）。 */
  readonly openPort: () => SpotlightPort
  /** Spotlight を開いたウィンドウ。 */
  readonly callerWindowId: WindowId
  /** 検索の応答を待つ時間。過ぎたら届かなかったものとして null で解決する。省略時は 5 秒。 */
  readonly searchTimeoutMs?: number
}

export interface SpotlightPortConnection extends SpotlightConnection {
  /** 接続を切り、まだ答えの無い問い合わせを解決する。 */
  readonly close: () => void
}

type Settle = (message: SpotlightServerMessage | null) => void

const decodeServerMessage = Schema.decodeUnknownOption(SpotlightServerMessage)

/**
 * background に Port でつなぐ。接続は最初の問い合わせのときに開き、切れたら次の問い合わせでつなぎ直す。
 * 開いている間に service worker が止まって Port が切れても、入力を続ければそのまま使える。
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

  // 切断の通知より先に送信が失敗することがあるので、送れなければ一度だけつなぎ直して送る
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
      // background が要求を読めずに捨てると、応答も切断も届かず「読み込み中」のまま止まってしまう
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
      if (!post(message(requestId))) {
        clearTimeout(timer)
        pending.delete(requestId)
        resolve(null)
      }
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
    // 開く処理は background で他の操作の後に並ぶことがあり、時間を区切ると開けたのに失敗と出してしまう
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
      return reply?._tag === "ChoiceSettled"
        ? reply.outcome
        : ({ _tag: "Failed", reason: strings.unreachable } satisfies SpotlightOutcome)
    },
    close: () => {
      const current = port
      port = null
      current?.disconnect()
      settleAll()
    },
  }
}
