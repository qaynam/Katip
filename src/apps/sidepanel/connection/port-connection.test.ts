import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpaceId } from "#modules/space"
import { TabId, WindowId } from "#platform/browser"
import type { ClientMessage, SidebarCommand } from "#protocol"
import { sidebarView } from "../testing/view-builders"
import { createPortConnection, type PortConnection, type SidebarPort } from "./port-connection"
import type { SidebarEvent } from "./sidebar-connection"

class FakePort implements SidebarPort {
  readonly sent: Array<ClientMessage> = []
  isDisconnected = false
  private readonly messageListeners: Array<(message: unknown) => void> = []
  private readonly disconnectListeners: Array<() => void> = []

  readonly postMessage = (message: unknown) => {
    if (this.isDisconnected) throw new Error("Attempting to use a disconnected port object")
    this.sent.push(message as ClientMessage)
  }
  readonly disconnect = () => {
    this.isDisconnected = true
  }
  readonly onMessage = {
    addListener: (listener: (message: unknown) => void) => this.messageListeners.push(listener),
  }
  readonly onDisconnect = {
    addListener: (listener: () => void) => this.disconnectListeners.push(listener),
  }

  deliver(message: unknown) {
    for (const listener of this.messageListeners) listener(message)
  }
  dropFromServer() {
    this.isDisconnected = true
    for (const listener of this.disconnectListeners) listener()
  }
  get sentTags() {
    return this.sent.map((message) => message._tag)
  }
}

const windowId = WindowId.make(7)
const closeTab: SidebarCommand = { _tag: "CloseTab", tabId: TabId.make(1) }
const switchSpace: SidebarCommand = {
  _tag: "SwitchSpace",
  windowId,
  spaceId: SpaceId.make("hobby"),
}

let ports: Array<FakePort>
let connection: PortConnection

const latestPort = () => {
  const port = ports.at(-1)
  if (port === undefined) throw new Error("ポートがまだ開かれていない")
  return port
}

const connect = (options: { readonly openPort?: () => SidebarPort } = {}) => {
  connection = createPortConnection({
    windowId,
    openPort:
      options.openPort ??
      (() => {
        const port = new FakePort()
        ports.push(port)
        return port
      }),
  })
}

const runRequestIdOf = (port: FakePort, index: number) => {
  const message = port.sent.filter((sent) => sent._tag === "Run")[index]
  if (message?._tag !== "Run") throw new Error(`${index} 番目の Run が送られていない`)
  return message.requestId
}

beforeEach(() => {
  vi.useFakeTimers()
  ports = []
})

afterEach(() => {
  connection.close()
  vi.useRealTimers()
})

describe("接続したとき", () => {
  it("自分のウィンドウのビューを購読する", () => {
    connect()

    expect(latestPort().sent).toStrictEqual([{ _tag: "Subscribe", windowId }])
  })

  it("届いたビューを購読者へ渡す", () => {
    connect()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))
    const view = sidebarView()

    latestPort().deliver({ _tag: "ViewUpdated", view })

    expect(events).toStrictEqual([{ _tag: "ViewUpdated", view }])
  })

  it("後から購読しても、最後に届いたビューを受け取れる", () => {
    connect()
    const view = sidebarView()
    latestPort().deliver({ _tag: "ViewUpdated", view })
    const events: Array<SidebarEvent> = []

    connection.listen((event) => events.push(event))

    expect(events).toStrictEqual([{ _tag: "ViewUpdated", view }])
  })

  it("形式の合わないメッセージは無視する", () => {
    connect()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))

    latestPort().deliver({ _tag: "ViewUpdated", view: { windowId: "broken" } })
    latestPort().deliver("hello")

    expect(events).toStrictEqual([])
  })

  it("開いている間は 20 秒ごとに KeepAlive を送る", () => {
    connect()

    vi.advanceTimersByTime(40_000)

    expect(latestPort().sentTags).toStrictEqual(["Subscribe", "KeepAlive", "KeepAlive"])
  })
})

describe("コマンドを実行したとき", () => {
  it("応答が前後しても、requestId が一致する結果で解決する", async () => {
    connect()
    const port = latestPort()
    const closing = connection.run(closeTab)
    const switching = connection.run(switchSpace)

    port.deliver({
      _tag: "CommandSettled",
      requestId: runRequestIdOf(port, 1),
      outcome: { _tag: "Failed", reason: "Space が見つかりません" },
    })
    port.deliver({
      _tag: "CommandSettled",
      requestId: runRequestIdOf(port, 0),
      outcome: { _tag: "Succeeded", createdBookmarkId: null },
    })

    expect(await closing).toStrictEqual({ _tag: "Succeeded", createdBookmarkId: null })
    expect(await switching).toStrictEqual({ _tag: "Failed", reason: "Space が見つかりません" })
  })

  it("リクエストごとに異なる requestId を付ける", () => {
    connect()

    void connection.run(closeTab)
    void connection.run(closeTab)

    expect(runRequestIdOf(latestPort(), 0)).not.toBe(runRequestIdOf(latestPort(), 1))
  })

  it("結果が届く前に切断されたら、届いたか分からないこととして解決する", async () => {
    connect()
    const closing = connection.run(closeTab)

    latestPort().dropFromServer()

    expect(await closing).toStrictEqual({ _tag: "Undelivered", reason: "Disconnected" })
  })

  it("再接続を待っている間に実行すると、すぐに届けられなかったこととして解決する", async () => {
    connect()
    latestPort().dropFromServer()

    const outcome = await connection.run(closeTab)

    expect(outcome).toStrictEqual({ _tag: "Undelivered", reason: "NotConnected" })
  })
})

describe("切断されたとき", () => {
  it("再接続して購読し直す", () => {
    connect()

    latestPort().dropFromServer()
    vi.advanceTimersByTime(0)

    expect(ports).toHaveLength(2)
    expect(latestPort().sent).toStrictEqual([{ _tag: "Subscribe", windowId }])
  })

  it("接続に失敗し続けても、間隔を空けながら再試行を続ける", () => {
    let attempts = 0
    connect({
      openPort: () => {
        attempts += 1
        throw new Error("Extension context invalidated")
      },
    })

    vi.advanceTimersByTime(10_000)

    expect(attempts).toBeGreaterThan(3)
    expect(attempts).toBeLessThan(10)
  })

  it("古いポートに遅れて届いたメッセージは無視する", () => {
    connect()
    const oldPort = latestPort()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))
    oldPort.dropFromServer()
    vi.advanceTimersByTime(0)

    oldPort.deliver({ _tag: "Notice", message: "古い通知" })

    expect(events).toStrictEqual([])
  })
})

describe("close したとき", () => {
  it("それ以降は再接続しない", () => {
    connect()

    connection.close()
    vi.advanceTimersByTime(60_000)

    expect(ports).toHaveLength(1)
    expect(latestPort().isDisconnected).toBe(true)
  })
})
