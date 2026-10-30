import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, type Scope, Stream } from "effect"
import type { PortSender, WindowId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { ClientMessage, SIDEBAR_PORT_NAME } from "#protocol"
import { AcceptsExternalConnection, isLocalDevelopmentPage } from "./external-connection"
import { backgroundTestLayer, startBackground } from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const externalSender = (origin: string): PortSender => ({
  external: true,
  url: Option.some(`${origin}/`),
  origin: Option.some(origin),
  tabId: Option.none(),
})

const otherExtension = externalSender("chrome-extension://abcdefghijklmnopabcdefghijklmnop")
const developmentPage = externalSender("http://localhost:5173")

const subscribe = (windowId: WindowId) =>
  Schema.encodeSync(ClientMessage)({ _tag: "Subscribe", windowId })

const connectAsSidebar = (sender: PortSender) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
    yield* startBackground
    const port = yield* fake.connect(SIDEBAR_PORT_NAME, sender)
    yield* port.post(subscribe(windowId))
    return port
  })

describe("拡張の外からの接続", () => {
  it.live("他の拡張機能から接続されても、タブの一覧を送らずに切る", () =>
    inBackground(
      Effect.gen(function* () {
        const port = yield* connectAsSidebar(otherExtension)

        yield* port.disconnected.pipe(Effect.timeout("2 seconds"))
        const received = yield* Stream.runCollect(port.messages)

        expect(received).toStrictEqual([])
      }),
    ),
  )

  it.live("開発ビルドの規則では、localhost の検証用ページにタブの一覧を送る", () =>
    inBackground(
      Effect.gen(function* () {
        const port = yield* connectAsSidebar(developmentPage)

        const first = yield* port.messages.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.timeout("2 seconds"),
        )

        expect(first).toHaveLength(1)
      }).pipe(Effect.provideService(AcceptsExternalConnection, isLocalDevelopmentPage)),
    ),
  )

  it.live("開発ビルドの規則でも、他の拡張機能からの接続は切る", () =>
    inBackground(
      Effect.gen(function* () {
        const port = yield* connectAsSidebar(otherExtension)

        yield* port.disconnected.pipe(Effect.timeout("2 seconds"))
        const received = yield* Stream.runCollect(port.messages)

        expect(received).toStrictEqual([])
      }).pipe(Effect.provideService(AcceptsExternalConnection, isLocalDevelopmentPage)),
    ),
  )
})
