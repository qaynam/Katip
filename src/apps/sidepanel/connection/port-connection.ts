import { Schema } from "effect"
import type { WindowId } from "#platform/browser"
import {
  RequestId,
  ServerMessage,
  type ClientMessage,
  type CommandOutcome,
  type SidebarView,
} from "#protocol"
import type { SidebarConnection, SidebarEvent, Undelivered } from "./sidebar-connection"

/** chrome.runtime.Port のうち、接続が使う部分だけ */
export interface SidebarPort {
  readonly postMessage: (message: unknown) => void
  readonly disconnect: () => void
  readonly onMessage: { readonly addListener: (listener: (message: unknown) => void) => void }
  readonly onDisconnect: { readonly addListener: (listener: () => void) => void }
}

export interface PortConnectionOptions {
  /** 例外を投げてもよい（拡張の再読み込み直後など）。その場合も間隔を空けて再試行する */
  readonly openPort: () => SidebarPort
  /** null は「最後にフォーカスされた通常ウィンドウ」を購読する */
  readonly windowId: WindowId | null
  readonly keepAliveIntervalMs?: number
  /** n 回目の再接続を待つ時間。回数が配列より多ければ最後の値を使い続ける */
  readonly reconnectDelaysMs?: ReadonlyArray<number>
}

export interface PortConnection extends SidebarConnection {
  /** 以後は再接続せず、未解決のコマンドを Undelivered で解決する */
  readonly close: () => void
}

const undelivered = (reason: Undelivered["reason"]): Undelivered => ({
  _tag: "Undelivered",
  reason,
})

const decodeServerMessage = Schema.decodeUnknownOption(ServerMessage)

export const createPortConnection = (options: PortConnectionOptions): PortConnection => {
  const keepAliveIntervalMs = options.keepAliveIntervalMs ?? 20_000
  const reconnectDelaysMs = options.reconnectDelaysMs ?? [0, 500, 1_000, 2_000, 5_000]

  const listeners = new Set<(event: SidebarEvent) => void>()
  const pending = new Map<RequestId, (outcome: CommandOutcome | Undelivered) => void>()
  let latestView: SidebarView | null = null
  let port: SidebarPort | null = null
  let nextRequestId = 1
  let failedAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let isClosed = false

  const emit = (event: SidebarEvent) => {
    for (const listener of listeners) listener(event)
  }

  const settleAllPending = (reason: Undelivered["reason"]) => {
    const resolvers = [...pending.values()]
    pending.clear()
    for (const resolve of resolvers) resolve(undelivered(reason))
  }

  const receive = (message: ServerMessage) => {
    failedAttempts = 0
    switch (message._tag) {
      case "ViewUpdated":
        latestView = message.view
        emit(message)
        return
      case "Notice":
        emit(message)
        return
      case "CommandSettled": {
        const resolve = pending.get(message.requestId)
        pending.delete(message.requestId)
        resolve?.(message.outcome)
        return
      }
    }
  }

  const scheduleReconnect = () => {
    if (isClosed || reconnectTimer !== null) return
    const delay = reconnectDelaysMs[Math.min(failedAttempts, reconnectDelaysMs.length - 1)] ?? 0
    failedAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const handleDisconnect = (lost: SidebarPort) => {
    if (port !== lost) return
    port = null
    settleAllPending("Disconnected")
    scheduleReconnect()
  }

  const send = (message: ClientMessage): boolean => {
    const current = port
    if (current === null) return false
    try {
      current.postMessage(message)
      return true
    } catch {
      handleDisconnect(current)
      return false
    }
  }

  const connect = () => {
    if (isClosed) return
    let opened: SidebarPort
    try {
      opened = options.openPort()
    } catch {
      scheduleReconnect()
      return
    }
    port = opened
    opened.onMessage.addListener((raw) => {
      if (port !== opened) return
      const decoded = decodeServerMessage(raw)
      if (decoded._tag === "Some") receive(decoded.value)
    })
    opened.onDisconnect.addListener(() => handleDisconnect(opened))
    send({ _tag: "Subscribe", windowId: options.windowId })
  }

  const keepAliveTimer = setInterval(() => send({ _tag: "KeepAlive" }), keepAliveIntervalMs)

  connect()

  return {
    listen: (listener) => {
      listeners.add(listener)
      if (latestView !== null) listener({ _tag: "ViewUpdated", view: latestView })
      return () => listeners.delete(listener)
    },
    run: (command) => {
      const requestId = RequestId.make(nextRequestId++)
      return new Promise((resolve) => {
        pending.set(requestId, resolve)
        if (!send({ _tag: "Run", requestId, command })) {
          pending.delete(requestId)
          resolve(undelivered("NotConnected"))
        }
      })
    },
    close: () => {
      isClosed = true
      clearInterval(keepAliveTimer)
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      const current = port
      port = null
      current?.disconnect()
      settleAllPending("Disconnected")
    },
  }
}
