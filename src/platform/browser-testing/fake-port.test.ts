import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { BrowserEvents, Ports } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const acceptConnection = Effect.flatMap(
  BrowserEvents.use(({ connections }) => connections.pipe(Stream.take(1), Stream.runCollect)),
  ([port]) => Effect.fromNullishOr(port),
)

layer(FakeBrowser.layer, { buildPerTest: true })("Port の fake", (it) => {
  describe("Ports で接続したとき", () => {
    it.effect("受け付ける側の Port が、同じ名前で BrowserEvents.connections に流れる", () =>
      Effect.gen(function* () {
        const ports = yield* Ports

        yield* ports.connect("katip/sidebar")

        assert.strictEqual((yield* acceptConnection).name, "katip/sidebar")
      }),
    )

    it.effect("送ったメッセージは JSON を通った形で相手に届く", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* client.post({ at: new Date(0) })

        const received = yield* server.messages.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(received, [{ at: "1970-01-01T00:00:00.000Z" }])
      }),
    )

    it.effect("受け付ける側から送ったメッセージも接続した側に届く", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* server.post("view")

        const received = yield* client.messages.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(received, ["view"])
      }),
    )

    it.effect("相手が切断すると、messages が終わり disconnected が完了する", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* client.disconnect

        assert.deepStrictEqual(yield* Stream.runCollect(server.messages), [])
        yield* server.disconnected
      }),
    )

    it.effect("切断した後に送ると PortDisconnectedError で失敗する", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection
        yield* server.disconnect

        const error = yield* Effect.flip(client.post("hello"))

        assert.strictEqual(error._tag, "PortDisconnectedError")
      }),
    )

    it.effect("スコープを閉じると切断される", () =>
      Effect.gen(function* () {
        const ports = yield* Ports

        yield* Effect.scoped(ports.connect("katip/sidebar"))

        yield* (yield* acceptConnection).disconnected
      }),
    )

    it.effect("自分から接続した側の Port には送信元が無い", () =>
      Effect.gen(function* () {
        const ports = yield* Ports

        const client = yield* ports.connect("katip/sidebar")

        assert.deepStrictEqual(client.sender, Option.none())
      }),
    )
  })

  describe("FakeBrowser から接続したとき", () => {
    it.effect("指定した送信元が、受け付ける側の Port に入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const sender = {
          external: true,
          url: Option.some("http://localhost/dev.html"),
          origin: Option.some("http://localhost"),
          tabId: Option.none(),
        }

        yield* fake.connect("dev", sender)

        assert.deepStrictEqual((yield* acceptConnection).sender, Option.some(sender))
      }),
    )
  })
})
