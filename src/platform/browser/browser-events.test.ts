import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import {
  type BrowserEventSources,
  type CapturedBrowserEvents,
  captureBrowserEvents,
} from "./browser-events"
import type { BrowserEvent } from "./browser-event"
import type { ChromePort } from "./browser-port"
import { TabGroupId, TabId, WindowId } from "./ids"

type ListenerIn<Source> = Source extends { addListener(listener: infer Listener): void }
  ? Listener
  : never
type ListenerArgs<Source> = Parameters<Extract<ListenerIn<Source>, (...args: never[]) => unknown>>

/** `chrome` の代わりに渡し、テストから Chrome のイベントを起こす。 */
const makeFakeChromeEvents = () => {
  const listeners = new Map<string, ReadonlyArray<(...args: ReadonlyArray<unknown>) => void>>()
  const source = (key: string) => ({
    addListener: (listener: (...args: ReadonlyArray<unknown>) => void) => {
      listeners.set(key, [...(listeners.get(key) ?? []), listener])
    },
  })
  const sources = new Proxy({} as BrowserEventSources, {
    get: (_, namespace) =>
      new Proxy({}, { get: (_, event) => source(`${String(namespace)}.${String(event)}`) }),
  })
  const fire = <N extends keyof BrowserEventSources, E extends keyof BrowserEventSources[N]>(
    namespace: N,
    event: E,
    ...args: ListenerArgs<BrowserEventSources[N][E]>
  ) =>
    (listeners.get(`${namespace}.${String(event)}`) ?? []).forEach((listener) => listener(...args))
  return { sources, fire }
}

const chromeTab = (overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id: 1,
  index: 0,
  windowId: 10,
  url: "https://example.com/",
  title: "Example",
  pinned: false,
  highlighted: false,
  active: false,
  frozen: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  lastAccessed: 0,
  ...overrides,
})

const makeChromePort = (name: string, sender?: chrome.runtime.MessageSender) => {
  const messageListeners: Array<(message: unknown) => void> = []
  const disconnectListeners: Array<() => void> = []
  const posted: Array<unknown> = []
  const port: ChromePort = {
    name,
    ...(sender !== undefined && { sender }),
    postMessage: (message) => posted.push(message),
    disconnect: () => {},
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
  }
  return {
    port,
    posted,
    receive: (message: unknown) => messageListeners.forEach((listener) => listener(message)),
    disconnectFromOtherSide: () => disconnectListeners.forEach((listener) => listener()),
  }
}

const tabUpdated = (event: BrowserEvent | undefined) =>
  event?._tag === "TabUpdated" ? Option.some(event) : Option.none()

const tabCreated = (event: BrowserEvent | undefined) =>
  event?._tag === "TabCreated" ? Option.some(event) : Option.none()

const takeEvents = (captured: CapturedBrowserEvents, count: number) =>
  captured.events.pipe(Stream.take(count), Stream.runCollect)

const takeConnection = (captured: CapturedBrowserEvents) =>
  Effect.flatMap(captured.connections.pipe(Stream.take(1), Stream.runCollect), ([port]) =>
    Effect.fromNullishOr(port),
  )

describe("購読より前に起きたイベント", () => {
  it.effect("最初の購読者が起きた順に受け取る", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("runtime", "onStartup")
      chrome.fire("alarms", "onAlarm", {
        name: "tick",
        scheduledTime: 1000,
        persistAcrossSessions: false,
      })

      const events = yield* takeEvents(captured, 2)
      assert.deepStrictEqual(
        events.map((event) => event._tag),
        ["RuntimeStartup", "AlarmFired"],
      )
    }),
  )
})

describe("Chrome の値の正規化", () => {
  it.effect("グループから外れたタブは、変化も現在の値も groupId が None になる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("tabs", "onUpdated", 1, { groupId: -1 }, chromeTab({ id: 1, groupId: -1 }))

      const updated = tabUpdated((yield* takeEvents(captured, 1))[0])
      assert.deepStrictEqual(
        Option.map(updated, ({ changes }) => changes.groupId),
        Option.some(Option.none()),
      )
      assert.deepStrictEqual(
        Option.map(updated, ({ tab }) => tab.groupId),
        Option.some(Option.none()),
      )
    }),
  )

  it.effect("グループに入ったタブは groupId がそのグループになる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("tabs", "onUpdated", 1, { groupId: 7 }, chromeTab({ id: 1, groupId: 7 }))

      const updated = tabUpdated((yield* takeEvents(captured, 1))[0])
      assert.deepStrictEqual(
        Option.map(updated, ({ changes }) => changes.groupId),
        Option.some(Option.some(TabGroupId.make(7))),
      )
    }),
  )

  it.effect("分割ビューが解けたタブは、変化も現在の値も splitViewId が None になる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire(
        "tabs",
        "onUpdated",
        1,
        { splitViewId: -1 },
        chromeTab({ id: 1, splitViewId: -1 }),
      )

      const updated = tabUpdated((yield* takeEvents(captured, 1))[0])
      assert.deepStrictEqual(
        Option.map(updated, ({ changes }) => changes.splitViewId),
        Option.some(Option.none()),
      )
      assert.deepStrictEqual(
        Option.map(updated, ({ tab }) => tab.splitViewId),
        Option.some(Option.none()),
      )
    }),
  )

  it.effect("ID を持たないタブのイベントは流さない", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("tabs", "onCreated", chromeTab({ id: undefined }))
      chrome.fire("tabs", "onCreated", chromeTab({ id: 2 }))

      const [event] = yield* takeEvents(captured, 1)
      assert.deepStrictEqual(
        Option.map(tabCreated(event), ({ tab }) => tab.id),
        Option.some(TabId.make(2)),
      )
    }),
  )

  it.effect("どのウィンドウにもフォーカスが無くなると、フォーカス先は None になる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("windows", "onFocusChanged", -1)
      chrome.fire("windows", "onFocusChanged", 10)

      const events = yield* takeEvents(captured, 2)
      assert.deepStrictEqual(events, [
        { _tag: "WindowFocusChanged", windowId: Option.none() },
        { _tag: "WindowFocusChanged", windowId: Option.some(WindowId.make(10)) },
      ])
    }),
  )

  it.effect("初回インストールには以前のバージョンが無い", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)

      chrome.fire("runtime", "onInstalled", { reason: "install" })

      const [event] = yield* takeEvents(captured, 1)
      assert.deepStrictEqual(event, {
        _tag: "RuntimeInstalled",
        reason: "install",
        previousVersion: Option.none(),
      })
    }),
  )
})

describe("受け付けた Port", () => {
  it.effect("接続直後に届いたメッセージを、後から購読しても受け取れる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)
      const remote = makeChromePort("katip/sidebar")

      chrome.fire("runtime", "onConnect", remote.port)
      remote.receive({ _tag: "Subscribe" })

      const port = yield* takeConnection(captured)
      const messages = yield* port.messages.pipe(Stream.take(1), Stream.runCollect)
      assert.deepStrictEqual(messages, [{ _tag: "Subscribe" }])
    }),
  )

  it.effect("拡張の外からの接続は sender の external が true になる", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)
      const remote = makeChromePort("dev", {
        url: "http://localhost/dev.html",
        origin: "http://localhost",
      })

      chrome.fire("runtime", "onConnectExternal", remote.port)

      const port = yield* takeConnection(captured)
      assert.deepStrictEqual(
        port.sender,
        Option.some({
          external: true,
          url: Option.some("http://localhost/dev.html"),
          origin: Option.some("http://localhost"),
          tabId: Option.none(),
        }),
      )
    }),
  )

  it.effect("相手が切断すると messages が終わり、disconnected が完了する", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)
      const remote = makeChromePort("katip/sidebar")
      chrome.fire("runtime", "onConnect", remote.port)
      const port = yield* takeConnection(captured)

      remote.receive("last")
      remote.disconnectFromOtherSide()

      assert.deepStrictEqual(yield* Stream.runCollect(port.messages), ["last"])
      yield* port.disconnected
    }),
  )

  it.effect("切断を検知した後に送ると PortDisconnectedError で失敗し、相手には届かない", () =>
    Effect.gen(function* () {
      const chrome = makeFakeChromeEvents()
      const captured = captureBrowserEvents(chrome.sources)
      const remote = makeChromePort("katip/sidebar")
      chrome.fire("runtime", "onConnect", remote.port)
      const port = yield* takeConnection(captured)
      remote.disconnectFromOtherSide()

      const error = yield* Effect.flip(port.post("hello"))

      assert.strictEqual(error._tag, "PortDisconnectedError")
      assert.deepStrictEqual(remote.posted, [])
    }),
  )
})
