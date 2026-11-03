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
  if (port === undefined) throw new Error("No port has been opened yet")
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
  if (message?._tag !== "Run") throw new Error(`Run #${index} has not been sent`)
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

describe("When connected", () => {
  it("subscribes to the view of its own window", () => {
    connect()

    expect(latestPort().sent).toStrictEqual([{ _tag: "Subscribe", windowId }])
  })

  it("passes received views to listeners", () => {
    connect()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))
    const view = sidebarView()

    latestPort().deliver({ _tag: "ViewUpdated", view })

    expect(events).toStrictEqual([{ _tag: "ViewUpdated", view }])
  })

  it("gives a late listener the last received view", () => {
    connect()
    const view = sidebarView()
    latestPort().deliver({ _tag: "ViewUpdated", view })
    const events: Array<SidebarEvent> = []

    connection.listen((event) => events.push(event))

    expect(events).toStrictEqual([{ _tag: "ViewUpdated", view }])
  })

  it("ignores malformed messages", () => {
    connect()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))

    latestPort().deliver({ _tag: "ViewUpdated", view: { windowId: "broken" } })
    latestPort().deliver("hello")

    expect(events).toStrictEqual([])
  })

  it("sends KeepAlive every 20 seconds while open", () => {
    connect()

    vi.advanceTimersByTime(40_000)

    expect(latestPort().sentTags).toStrictEqual(["Subscribe", "KeepAlive", "KeepAlive"])
  })
})

describe("When running a command", () => {
  it("resolves with the outcome whose requestId matches, even when responses arrive out of order", async () => {
    connect()
    const port = latestPort()
    const closing = connection.run(closeTab)
    const switching = connection.run(switchSpace)

    port.deliver({
      _tag: "CommandSettled",
      requestId: runRequestIdOf(port, 1),
      outcome: { _tag: "Failed", reason: "Space not found" },
    })
    port.deliver({
      _tag: "CommandSettled",
      requestId: runRequestIdOf(port, 0),
      outcome: { _tag: "Succeeded", createdBookmarkId: null },
    })

    expect(await closing).toStrictEqual({ _tag: "Succeeded", createdBookmarkId: null })
    expect(await switching).toStrictEqual({ _tag: "Failed", reason: "Space not found" })
  })

  it("gives each request a different requestId", () => {
    connect()

    void connection.run(closeTab)
    void connection.run(closeTab)

    expect(runRequestIdOf(latestPort(), 0)).not.toBe(runRequestIdOf(latestPort(), 1))
  })

  it("resolves as possibly undelivered when disconnected before the outcome arrives", async () => {
    connect()
    const closing = connection.run(closeTab)

    latestPort().dropFromServer()

    expect(await closing).toStrictEqual({ _tag: "Undelivered", reason: "Disconnected" })
  })

  it("resolves as not delivered right away when run while waiting to reconnect", async () => {
    connect()
    latestPort().dropFromServer()

    const outcome = await connection.run(closeTab)

    expect(outcome).toStrictEqual({ _tag: "Undelivered", reason: "NotConnected" })
  })
})

describe("When disconnected", () => {
  it("reconnects and subscribes again", () => {
    connect()

    latestPort().dropFromServer()
    vi.advanceTimersByTime(0)

    expect(ports).toHaveLength(2)
    expect(latestPort().sent).toStrictEqual([{ _tag: "Subscribe", windowId }])
  })

  it("keeps retrying with delays even when connecting keeps failing", () => {
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

  it("ignores messages that arrive late on an old port", () => {
    connect()
    const oldPort = latestPort()
    const events: Array<SidebarEvent> = []
    connection.listen((event) => events.push(event))
    oldPort.dropFromServer()
    vi.advanceTimersByTime(0)

    oldPort.deliver({ _tag: "Notice", message: "Stale notice" })

    expect(events).toStrictEqual([])
  })
})

describe("When closed", () => {
  it("never reconnects afterwards", () => {
    connect()

    connection.close()
    vi.advanceTimersByTime(60_000)

    expect(ports).toHaveLength(1)
    expect(latestPort().isDisconnected).toBe(true)
  })
})
