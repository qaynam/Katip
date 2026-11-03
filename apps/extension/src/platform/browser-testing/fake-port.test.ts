import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { BrowserEvents, Ports } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const acceptConnection = Effect.flatMap(
  BrowserEvents.use(({ connections }) => connections.pipe(Stream.take(1), Stream.runCollect)),
  ([port]) => Effect.fromNullishOr(port),
)

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Port", (it) => {
  describe("connecting through Ports", () => {
    it.effect(
      "emits the accepting side's Port on BrowserEvents.connections under the same name",
      () =>
        Effect.gen(function* () {
          const ports = yield* Ports

          yield* ports.connect("katip/sidebar")

          assert.strictEqual((yield* acceptConnection).name, "katip/sidebar")
        }),
    )

    it.effect("delivers a posted message to the peer as it comes out of JSON", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* client.post({ at: new Date(0) })

        const received = yield* server.messages.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(received, [{ at: "1970-01-01T00:00:00.000Z" }])
      }),
    )

    it.effect("delivers messages from the accepting side to the connecting side too", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* server.post("view")

        const received = yield* client.messages.pipe(Stream.take(1), Stream.runCollect)
        assert.deepStrictEqual(received, ["view"])
      }),
    )

    it.effect("ends messages and completes disconnected when the peer disconnects", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection

        yield* client.disconnect

        assert.deepStrictEqual(yield* Stream.runCollect(server.messages), [])
        yield* server.disconnected
      }),
    )

    it.effect("fails with PortDisconnectedError when posting after a disconnect", () =>
      Effect.gen(function* () {
        const ports = yield* Ports
        const client = yield* ports.connect("katip/sidebar")
        const server = yield* acceptConnection
        yield* server.disconnect

        const error = yield* Effect.flip(client.post("hello"))

        assert.strictEqual(error._tag, "PortDisconnectedError")
      }),
    )

    it.effect("disconnects when the scope closes", () =>
      Effect.gen(function* () {
        const ports = yield* Ports

        yield* Effect.scoped(ports.connect("katip/sidebar"))

        yield* (yield* acceptConnection).disconnected
      }),
    )

    it.effect("gives the connecting side's Port no sender", () =>
      Effect.gen(function* () {
        const ports = yield* Ports

        const client = yield* ports.connect("katip/sidebar")

        assert.deepStrictEqual(client.sender, Option.none())
      }),
    )
  })

  describe("connecting from FakeBrowser", () => {
    it.effect("gives the accepting side's Port the specified sender", () =>
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
