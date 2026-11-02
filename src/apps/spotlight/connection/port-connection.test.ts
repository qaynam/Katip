import { afterEach, describe, expect, it, vi } from "vitest"
import { WindowId } from "#platform/browser"
import { RequestId, type SpotlightClientMessage, type SpotlightServerMessage } from "#protocol"
import { createSpotlightPortConnection, type SpotlightPort } from "./port-connection"

const CALLER = WindowId.make(7)

interface FakePort extends SpotlightPort {
  readonly sent: Array<SpotlightClientMessage>
  readonly deliver: (message: SpotlightServerMessage | unknown) => void
  readonly dropFromBackground: () => void
}

const fakePort = (options: { readonly rejectsPosts?: boolean } = {}): FakePort => {
  const sent: Array<SpotlightClientMessage> = []
  const messageListeners: Array<(message: unknown) => void> = []
  const disconnectListeners: Array<() => void> = []
  return {
    sent,
    postMessage: (message) => {
      if (options.rejectsPosts === true) throw new Error("Attempting to use a disconnected port")
      sent.push(message as SpotlightClientMessage)
    },
    disconnect: vi.fn(),
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
    deliver: (message) => messageListeners.forEach((listener) => listener(message)),
    dropFromBackground: () => disconnectListeners.forEach((listener) => listener()),
  }
}

const portsOpenedBy = (ports: ReadonlyArray<FakePort>) => {
  const queue = [...ports]
  const opened: Array<FakePort> = []
  const openPort = () => {
    const next = queue.shift() ?? fakePort()
    opened.push(next)
    return next
  }
  return { openPort, opened }
}

const searchResults = (requestId: number, title: string): SpotlightServerMessage => ({
  _tag: "SearchResults",
  requestId: RequestId.make(requestId),
  results: [{ _tag: "SearchWeb", query: title }],
  spaceTheme: null,
})

describe("search", () => {
  it("asks with the window that opened Spotlight, and resolves with the response of the same requestId", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.search("katip", "All")
    const [request] = port.sent
    port.deliver(searchResults(request?.requestId ?? -1, "katip"))

    expect(request).toMatchObject({ _tag: "Search", windowId: CALLER, query: "katip" })
    expect(await pending).toStrictEqual({
      results: [{ _tag: "SearchWeb", query: "katip" }],
      spaceTheme: null,
    })
  })

  it("asks in the given mode", () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    void connection.search("", "Actions")

    expect(port.sent).toMatchObject([{ _tag: "Search", query: "", mode: "Actions" }])
  })

  it("gives each search its own requestId and resolves each with its own response", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const first = connection.search("a", "All")
    const second = connection.search("ab", "All")
    const [firstRequest, secondRequest] = port.sent
    port.deliver(searchResults(secondRequest?.requestId ?? -1, "ab"))
    port.deliver(searchResults(firstRequest?.requestId ?? -1, "a"))

    expect(firstRequest?.requestId).not.toBe(secondRequest?.requestId)
    expect([(await first)?.results, (await second)?.results]).toStrictEqual([
      [{ _tag: "SearchWeb", query: "a" }],
      [{ _tag: "SearchWeb", query: "ab" }],
    ])
  })

  it("ignores messages of the wrong shape", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.search("katip", "All")
    port.deliver({ _tag: "SearchResults", requestId: "not a request ID" })
    port.deliver(searchResults(port.sent[0]?.requestId ?? -1, "katip"))

    expect(await pending).not.toBeNull()
  })

  it("resolves to null when the connection closes before the response", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.search("katip", "All")
    port.dropFromBackground()

    expect(await pending).toBeNull()
  })

  it("reconnects to send a search made after the connection closed", async () => {
    const { openPort, opened } = portsOpenedBy([fakePort(), fakePort()])
    const connection = createSpotlightPortConnection({ openPort, callerWindowId: CALLER })
    void connection.search("a", "All")
    opened[0]?.dropFromBackground()

    void connection.search("ab", "All")

    expect(opened.map((port) => port.sent.map((message) => message._tag))).toStrictEqual([
      ["Search"],
      ["Search"],
    ])
  })

  it("also reconnects to send when posting fails on a connection not yet reported as closed", async () => {
    const { openPort, opened } = portsOpenedBy([fakePort({ rejectsPosts: true }), fakePort()])
    const connection = createSpotlightPortConnection({ openPort, callerWindowId: CALLER })

    void connection.search("katip", "All")

    expect(opened[1]?.sent.map((message) => message._tag)).toStrictEqual(["Search"])
  })

  describe("when no response comes", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("resolves to null once the wait is over", async () => {
      vi.useFakeTimers()
      const port = fakePort()
      const connection = createSpotlightPortConnection({
        openPort: () => port,
        callerWindowId: CALLER,
        searchTimeoutMs: 1_000,
      })

      const pending = connection.search("katip", "All")
      vi.advanceTimersByTime(1_000)

      expect(await pending).toBeNull()
    })

    it("ignores a response that arrives after the wait is over", async () => {
      vi.useFakeTimers()
      const port = fakePort()
      const connection = createSpotlightPortConnection({
        openPort: () => port,
        callerWindowId: CALLER,
        searchTimeoutMs: 1_000,
      })
      const pending = connection.search("katip", "All")
      vi.advanceTimersByTime(1_000)

      port.deliver(searchResults(port.sent[0]?.requestId ?? -1, "katip"))

      expect(await pending).toBeNull()
    })
  })

  it("resolves to null when it can't connect to the background", async () => {
    const connection = createSpotlightPortConnection({
      openPort: () => {
        throw new Error("Extension context invalidated")
      },
      callerWindowId: CALLER,
    })

    expect(await connection.search("katip", "All")).toBeNull()
  })
})

describe("choose", () => {
  it("sends the chosen result with the window that opened Spotlight, and resolves with the outcome", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })
    const result = { _tag: "OpenUrl", url: "https://example.com/" } as const

    const pending = connection.choose(result)
    const [request] = port.sent
    port.deliver({
      _tag: "ChoiceSettled",
      requestId: request?.requestId ?? -1,
      outcome: { _tag: "Succeeded" },
    })

    expect(request).toMatchObject({ _tag: "Choose", windowId: CALLER, result })
    expect(await pending).toStrictEqual({ _tag: "Succeeded" })
  })

  it("resolves to null when the connection closes before the outcome", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.choose({ _tag: "SearchWeb", query: "katip" })
    port.dropFromBackground()

    expect(await pending).toBeNull()
  })
})

describe("close", () => {
  it("disconnects and resolves the searches still waiting for an answer to null", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })
    const pending = connection.search("katip", "All")

    connection.close()

    expect(port.disconnect).toHaveBeenCalled()
    expect(await pending).toBeNull()
  })
})
