import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { FakeHttp, httpResponse } from "#platform/http"
import { DEFAULT_BANG_FORMAT, formatOfFlags } from "./bang"
import { BangCatalog } from "./bang-catalog"
import bangDataUrl from "./data/bangs.json?url"

const catalogLayer = BangCatalog.layer.pipe(Layer.provideMerge(FakeHttp.layer))

const bundled = JSON.stringify([
  ["GitHub", ["gh", "github"], "https://github.com/search?q=%s"],
  ["Wayback Machine", ["wb"], "https://web.archive.org/web/*/%s", 1],
])

describe("the bundled bangs", () => {
  it.effect("are read from the file bundled with Katip, with each bang's format", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route(bangDataUrl, () => Effect.succeed(httpResponse(200, bundled)))

      const { bangs, index } = yield* (yield* BangCatalog).contents

      assert.deepStrictEqual(bangs, [
        {
          name: "GitHub",
          triggers: ["gh", "github"],
          template: "https://github.com/search?q=%s",
          format: DEFAULT_BANG_FORMAT,
        },
        {
          name: "Wayback Machine",
          triggers: ["wb"],
          template: "https://web.archive.org/web/*/%s",
          format: formatOfFlags(1),
        },
      ])
      assert.deepStrictEqual(
        Option.map(index.find("github"), (bang) => bang.name),
        Option.some("GitHub"),
      )
    }).pipe(Effect.provide(catalogLayer)),
  )

  it.effect("are read only once", () =>
    Effect.gen(function* () {
      const http = yield* FakeHttp
      yield* http.route(bangDataUrl, () => Effect.succeed(httpResponse(200, bundled)))
      const catalog = yield* BangCatalog

      yield* catalog.contents
      yield* catalog.contents

      assert.strictEqual((yield* http.requests).length, 1)
    }).pipe(Effect.provide(catalogLayer)),
  )

  it.effect("are read again after a read that failed", () =>
    Effect.gen(function* () {
      const http = yield* FakeHttp
      const catalog = yield* BangCatalog

      const failure = yield* Effect.flip(catalog.contents)
      yield* http.route(bangDataUrl, () => Effect.succeed(httpResponse(200, bundled)))
      const { bangs } = yield* catalog.contents

      assert.deepStrictEqual([failure._tag, bangs.length], ["BangsUnavailable", 2])
    }).pipe(Effect.provide(catalogLayer)),
  )

  it.effect("are unavailable when the file doesn't hold a list of bangs", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHttp).route(bangDataUrl, () =>
        Effect.succeed(httpResponse(200, `[["GitHub", [], "https://github.com/"]]`)),
      )

      const failure = yield* Effect.flip((yield* BangCatalog).contents)

      assert.strictEqual(failure._tag, "BangsUnavailable")
    }).pipe(Effect.provide(catalogLayer)),
  )
})
