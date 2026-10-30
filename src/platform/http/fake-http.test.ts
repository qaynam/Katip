import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FakeHttp, httpResponse } from "./fake-http"
import { Http } from "./http"

const get = (url: string) => Http.use((http) => http.send({ url, credentials: "omit" }))

describe("登録した応答", () => {
  it.effect("URL が登録した前置きで始まる要求に、その応答を返す", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route("https://api.example/", () =>
        Effect.succeed(httpResponse(200, "ok")),
      )

      const response = yield* get("https://api.example/items?q=1")

      assert.deepStrictEqual([response.status, response.body], [200, "ok"])
    }).pipe(Effect.provide(FakeHttp.layer)),
  )

  it.effect("同じ URL に当たる登録が複数あれば、後から登録した応答を返す", () =>
    Effect.gen(function* () {
      const fake = yield* FakeHttp
      yield* fake.route("https://api.example/", () => Effect.succeed(httpResponse(500)))
      yield* fake.route("https://api.example/", () => Effect.succeed(httpResponse(200)))

      const response = yield* get("https://api.example/items")

      assert.strictEqual(response.status, 200)
    }).pipe(Effect.provide(FakeHttp.layer)),
  )

  it.effect("どの登録にも当たらない要求は、接続できなかったものとして失敗する", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(get("https://unknown.example/"))

      assert.strictEqual(error._tag, "HttpRequestError")
    }).pipe(Effect.provide(FakeHttp.layer)),
  )
})

describe("要求の記録", () => {
  it.effect("失敗した要求も含め、送られた順に記録する", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route("https://a.example/", () => Effect.succeed(httpResponse(200)))

      yield* get("https://a.example/1")
      yield* Effect.flip(get("https://b.example/2"))

      const urls = (yield* (yield* FakeHttp).requests).map((request) => request.url)
      assert.deepStrictEqual(urls, ["https://a.example/1", "https://b.example/2"])
    }).pipe(Effect.provide(FakeHttp.layer)),
  )
})
