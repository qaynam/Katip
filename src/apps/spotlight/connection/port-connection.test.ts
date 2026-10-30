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

describe("検索", () => {
  it("開いたウィンドウを添えて問い合わせ、同じ requestId の応答で解決する", async () => {
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

  it("指定したモードで問い合わせる", () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    void connection.search("", "Actions")

    expect(port.sent).toMatchObject([{ _tag: "Search", query: "", mode: "Actions" }])
  })

  it("問い合わせごとに別の requestId を付け、それぞれの応答で解決する", async () => {
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

  it("形の合わないメッセージは無視する", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.search("katip", "All")
    port.deliver({ _tag: "SearchResults", requestId: "壊れた値" })
    port.deliver(searchResults(port.sent[0]?.requestId ?? -1, "katip"))

    expect(await pending).not.toBeNull()
  })

  it("応答の前に接続が切れたら null で解決する", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.search("katip", "All")
    port.dropFromBackground()

    expect(await pending).toBeNull()
  })

  it("接続が切れた後の問い合わせは、つなぎ直して送る", async () => {
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

  it("切断がまだ知らされていない接続へ送れなかったときも、つなぎ直して送る", async () => {
    const { openPort, opened } = portsOpenedBy([fakePort({ rejectsPosts: true }), fakePort()])
    const connection = createSpotlightPortConnection({ openPort, callerWindowId: CALLER })

    void connection.search("katip", "All")

    expect(opened[1]?.sent.map((message) => message._tag)).toStrictEqual(["Search"])
  })

  describe("応答が来ないとき", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("待つ時間が過ぎたら null で解決する", async () => {
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

    it("待つ時間が過ぎた後に届いた応答は無視する", async () => {
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

  it("background へつなげなければ null で解決する", async () => {
    const connection = createSpotlightPortConnection({
      openPort: () => {
        throw new Error("Extension context invalidated")
      },
      callerWindowId: CALLER,
    })

    expect(await connection.search("katip", "All")).toBeNull()
  })
})

describe("決定", () => {
  it("選んだ候補を開いたウィンドウを添えて送り、結果で解決する", async () => {
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

  it("結果の前に接続が切れたら Failed で解決する", async () => {
    const port = fakePort()
    const connection = createSpotlightPortConnection({
      openPort: () => port,
      callerWindowId: CALLER,
    })

    const pending = connection.choose({ _tag: "SearchWeb", query: "katip" })
    port.dropFromBackground()

    expect((await pending)._tag).toBe("Failed")
  })
})

describe("閉じたとき", () => {
  it("接続を切り、まだ答えの無い問い合わせを解決する", async () => {
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
