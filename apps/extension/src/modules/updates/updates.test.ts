import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse, unreachable } from "#platform/http"
import { LATEST_RELEASE_API_URL } from "./release"
import { UpdateCheckFailed, Updates } from "./updates"

const layerFor = (installedVersion: string) =>
  Updates.layer(installedVersion).pipe(
    Layer.provideMerge(Layer.mergeAll(FakeHttp.layer, FakeBrowser.layer)),
  )

const publish = (version: string) =>
  FakeHttp.use((http) =>
    http.route(LATEST_RELEASE_API_URL, () =>
      Effect.succeed(
        httpResponse(
          200,
          JSON.stringify({
            tag_name: `v${version}`,
            html_url: `https://github.com/qaynam/Katip/releases/tag/v${version}`,
            published_at: "2026-11-20T09:00:00Z",
          }),
        ),
      ),
    ),
  )

const requestCount = FakeHttp.use((http) => http.requests).pipe(Effect.map((sent) => sent.length))

describe("Checking for updates", () => {
  it.effect("finds a release later than the installed version", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")

      const status = yield* Updates.use((updates) => updates.check)

      expect(status._tag === "Available" && status.release.version).toBe("1.3.0")
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("is up to date when the latest release is the installed version or earlier", () =>
    Effect.gen(function* () {
      yield* publish("1.2.0")

      const status = yield* Updates.use((updates) => updates.check)

      expect(status._tag).toBe("UpToDate")
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("fails when GitHub can't be reached or doesn't reply with a release", () =>
    Effect.gen(function* () {
      yield* FakeHttp.use((http) => http.route(LATEST_RELEASE_API_URL, unreachable))
      const unreachableError = yield* Effect.flip(Updates.use((updates) => updates.check))
      yield* FakeHttp.use((http) =>
        http.route(LATEST_RELEASE_API_URL, () => Effect.succeed(httpResponse(403, "{}"))),
      )
      const refusedError = yield* Effect.flip(Updates.use((updates) => updates.check))

      expect([unreachableError, refusedError]).toStrictEqual([
        new UpdateCheckFailed({ reason: "Unreachable" }),
        new UpdateCheckFailed({ reason: "UnexpectedReply" }),
      ])
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("sends no cookies, so the check carries nothing about the user's GitHub account", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")

      yield* Updates.use((updates) => updates.check)

      const [request] = yield* FakeHttp.use((http) => http.requests)
      expect(request?.credentials).toBe("omit")
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )
})

describe("The update notice", () => {
  it.effect("tells about a later release", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")

      const notice = yield* Updates.use((updates) => updates.notice)

      expect(Option.map(notice, (release) => release.version)).toStrictEqual(Option.some("1.3.0"))
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("asks GitHub only once in a browser session, however often the side panel opens", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")

      yield* Updates.use((updates) => updates.notice)
      yield* Updates.use((updates) => updates.notice)

      expect(yield* requestCount).toBe(1)
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("goes by the release a check from the settings page found", () =>
    Effect.gen(function* () {
      yield* publish("1.2.0")
      yield* Updates.use((updates) => updates.notice)
      yield* publish("1.3.0")
      yield* Updates.use((updates) => updates.check)

      const notice = yield* Updates.use((updates) => updates.notice)

      expect(Option.map(notice, (release) => release.version)).toStrictEqual(Option.some("1.3.0"))
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("stops telling about a release once dismissed, but tells about a later one", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")
      yield* Updates.use((updates) => updates.dismiss("1.3.0"))
      const afterDismissing = yield* Updates.use((updates) => updates.notice)
      yield* publish("1.4.0")
      yield* Updates.use((updates) => updates.check)

      const afterLaterRelease = yield* Updates.use((updates) => updates.notice)

      expect([afterDismissing, Option.map(afterLaterRelease, (r) => r.version)]).toStrictEqual([
        Option.none(),
        Option.some("1.4.0"),
      ])
    }).pipe(Effect.provide(layerFor("1.2.0"))),
  )

  it.effect("tells nothing once the installed version has caught up", () =>
    Effect.gen(function* () {
      yield* publish("1.3.0")

      const notice = yield* Updates.use((updates) => updates.notice)

      expect(notice).toStrictEqual(Option.none())
    }).pipe(Effect.provide(layerFor("1.3.0"))),
  )
})
