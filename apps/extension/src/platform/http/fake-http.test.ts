import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FakeHttp, httpResponse } from "./fake-http"
import { Http } from "./http"

const get = (url: string) => Http.use((http) => http.send({ url, credentials: "omit" }))

describe("registered responses", () => {
  it.effect("answer a request whose URL starts with the registered prefix", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route("https://api.example/", () =>
        Effect.succeed(httpResponse(200, "ok")),
      )

      const response = yield* get("https://api.example/items?q=1")

      assert.deepStrictEqual([response.status, response.body], [200, "ok"])
    }).pipe(Effect.provide(FakeHttp.layer)),
  )

  it.effect("the latest registration wins when several match the same URL", () =>
    Effect.gen(function* () {
      const fake = yield* FakeHttp
      yield* fake.route("https://api.example/", () => Effect.succeed(httpResponse(500)))
      yield* fake.route("https://api.example/", () => Effect.succeed(httpResponse(200)))

      const response = yield* get("https://api.example/items")

      assert.strictEqual(response.status, 200)
    }).pipe(Effect.provide(FakeHttp.layer)),
  )

  it.effect("a request matching none fails as if the server could not be reached", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(get("https://unknown.example/"))

      assert.strictEqual(error._tag, "HttpRequestError")
    }).pipe(Effect.provide(FakeHttp.layer)),
  )
})

describe("recording requests", () => {
  it.effect("records requests in the order sent, including failed ones", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route("https://a.example/", () => Effect.succeed(httpResponse(200)))

      yield* get("https://a.example/1")
      yield* Effect.flip(get("https://b.example/2"))

      const urls = (yield* (yield* FakeHttp).requests).map((request) => request.url)
      assert.deepStrictEqual(urls, ["https://a.example/1", "https://b.example/2"])
    }).pipe(Effect.provide(FakeHttp.layer)),
  )
})
