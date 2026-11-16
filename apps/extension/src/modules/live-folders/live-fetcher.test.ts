import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse, unreachable } from "#platform/http"
import { FakePermissions } from "#platform/permissions"
import { GitHubTokenStore } from "./github-token-store"
import { LiveFetcher } from "./live-fetcher"
import type { LiveSource } from "./live-source"

const TestLayer = LiveFetcher.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(FakeHttp.layer, FakePermissions.layer, FakeBrowser.layer)),
)

const GMAIL_ORIGIN = "https://mail.google.com/*"
const GITHUB_ORIGIN = "https://github.com/*"
const GITHUB_API_ORIGIN = "https://api.github.com/*"
const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }
const mentioned: LiveSource = { _tag: "GitHub", query: "mentioned" }
const notifications: LiveSource = { _tag: "GitHub", query: "notifications" }

const gmailFeed = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@example.com</title><fullcount>1</fullcount><entry><title>Your invoice</title><link rel="alternate" href="https://mail.google.com/mail?account_id=taro.yamada@example.com&amp;message_id=19a&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><issued>2026-10-30T09:10:01Z</issued><id>tag:gmail.google.com,2004:1</id><author><name>Accounting</name><email>accounting@example.co.jp</email></author></entry></feed>`

const githubItem = (id: number, updatedAt: string) => ({
  id,
  number: id,
  title: `#${id}`,
  html_url: `https://github.com/katip-dev/katip/issues/${id}`,
  repository_url: "https://api.github.com/repos/katip-dev/katip",
  updated_at: updatedAt,
})

const githubBody = (items: ReadonlyArray<unknown>) =>
  JSON.stringify({ total_count: items.length, incomplete_results: false, items })

const webResult = (number: number, created: string) => ({
  id: String(number),
  hl_title: `#${number}`,
  number,
  created,
  repo: { repository: { name: "katip", owner_login: "katip-dev" } },
})

const webPage = (results: ReadonlyArray<unknown>, loggedIn = true) =>
  JSON.stringify({ payload: { blackbirdSearchRoute: { results, logged_in: loggedIn } } })

const notificationThread = (id: string, updatedAt: string) => ({
  id,
  updated_at: updatedAt,
  subject: {
    title: `#${id}`,
    url: `https://api.github.com/repos/katip-dev/katip/issues/${id}`,
    type: "Issue",
  },
  repository: { full_name: "katip-dev/katip", owner: { login: "katip-dev" } },
})

const fetchFailure = (source: LiveSource) =>
  Effect.map(
    Effect.flip(LiveFetcher.use((fetcher) => fetcher.fetch(source))),
    (error) => error.failure,
  )

describe("access permission", () => {
  it.effect("without access to the source, fails without sending a request", () =>
    Effect.gen(function* () {
      const failure = yield* fetchFailure(inbox)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "PermissionMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("Gmail", () => {
  it.effect("with access, reads the feed with the signed-in cookies and returns its items", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", () =>
        Effect.succeed(httpResponse(200, gmailFeed)),
      )

      const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(inbox))

      const [request] = yield* (yield* FakeHttp).requests
      assert.deepStrictEqual(
        [items.map((item) => [item.title, item.subtitle]), request?.credentials],
        [[["Your invoice", "Accounting"]], "include"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("marks the mails also in Gmail's feed of important mail as important", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", () =>
        Effect.succeed(httpResponse(200, gmailFeed)),
      )

      const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(inbox))

      const urls = (yield* (yield* FakeHttp).requests).map((request) => request.url).sort()
      assert.deepStrictEqual(
        [items.map((item) => item.isImportant), urls],
        [
          [true],
          [
            "https://mail.google.com/mail/u/0/feed/atom",
            "https://mail.google.com/mail/u/0/feed/atom/%5Eio_im",
          ],
        ],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("still lists the mail, unmarked, when the feed of important mail can't be read", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", (request) =>
        request.url.endsWith("%5Eio_im")
          ? unreachable(request)
          : Effect.succeed(httpResponse(200, gmailFeed)),
      )

      const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(inbox))

      assert.deepStrictEqual(
        items.map((item) => [item.title, item.isImportant]),
        [["Your invoice", undefined]],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails as unreachable when it can't connect", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", unreachable)

      assert.deepStrictEqual(yield* fetchFailure(inbox), { _tag: "Unreachable" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("gives up as unreachable when no response comes within 30 seconds", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Effect.never)
      const fetching = yield* Effect.forkChild(fetchFailure(inbox))

      yield* TestClock.adjust("30 seconds")

      assert.deepStrictEqual(yield* Fiber.join(fetching), { _tag: "Unreachable" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("GitHub with the signed-in session", () => {
  it.effect(
    "without a token, reads the search page with the signed-in cookies, combining pull request and issue results",
    () =>
      Effect.gen(function* () {
        yield* (yield* FakePermissions).grant([GITHUB_ORIGIN])
        yield* (yield* FakeHttp).route("https://github.com/search", (request) =>
          Effect.succeed(
            httpResponse(
              200,
              new URL(request.url).searchParams.get("type") === "issues"
                ? webPage([webResult(1, "2026-10-29T00:00:00Z")])
                : webPage([webResult(2, "2026-10-30T00:00:00Z")]),
            ),
          ),
        )

        const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(mentioned))

        const requests = yield* (yield* FakeHttp).requests
        assert.deepStrictEqual(
          [items.map((item) => item.url), requests.map((request) => request.credentials)],
          [
            [
              "https://github.com/katip-dev/katip/pull/2",
              "https://github.com/katip-dev/katip/issues/1",
            ],
            ["include", "include"],
          ],
        )
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("without access to github.com, fails without sending a request", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])

      const failure = yield* fetchFailure(mentioned)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "PermissionMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails as not signed in when signed out", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN])
      yield* (yield* FakeHttp).route("https://github.com/search", () =>
        Effect.succeed(httpResponse(200, webPage([], false))),
      )

      assert.deepStrictEqual(yield* fetchFailure(mentioned), { _tag: "NotSignedIn" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("GitHub with a token", () => {
  it.effect(
    "with a token set, searches the official API with it and merges the results most recently updated first",
    () =>
      Effect.gen(function* () {
        yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])
        yield* (yield* GitHubTokenStore).save("  ghp_secret  ")
        yield* (yield* FakeHttp).route("https://api.github.com/search/issues", (request) =>
          Effect.succeed(
            httpResponse(
              200,
              githubBody(
                new URL(request.url).searchParams.get("q")?.startsWith("is:issue")
                  ? [githubItem(1, "2026-10-29T00:00:00Z")]
                  : [githubItem(2, "2026-10-30T00:00:00Z")],
              ),
            ),
          ),
        )

        const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(mentioned))

        const requests = yield* (yield* FakeHttp).requests
        assert.deepStrictEqual(
          [
            items.map((item) => item.title),
            requests.map((request) => request.headers?.["Authorization"]),
          ],
          [
            ["#2", "#1"],
            ["Bearer ghp_secret", "Bearer ghp_secret"],
          ],
        )
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("without access to the official API, fails without sending a request", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN])
      yield* (yield* GitHubTokenStore).save("ghp_secret")

      const failure = yield* fetchFailure(mentioned)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "PermissionMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails as token rejected when the token isn't accepted", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])
      yield* (yield* GitHubTokenStore).save("ghp_revoked")
      yield* (yield* FakeHttp).route("https://api.github.com/", () =>
        Effect.succeed(httpResponse(401, '{"message":"Bad credentials"}')),
      )

      assert.deepStrictEqual(yield* fetchFailure(mentioned), { _tag: "TokenRejected" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("saving an empty token removes the token, so reading uses the signed-in session", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN, GITHUB_API_ORIGIN])
      yield* (yield* FakeHttp).route("https://github.com/search", () =>
        Effect.succeed(httpResponse(200, webPage([]))),
      )
      const tokens = yield* GitHubTokenStore
      yield* tokens.save("ghp_secret")

      yield* tokens.save(" ")
      yield* LiveFetcher.use((fetcher) => fetcher.fetch(mentioned))

      const requests = yield* (yield* FakeHttp).requests
      assert.isTrue(requests.every((request) => request.url.startsWith("https://github.com/")))
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("GitHub notifications", () => {
  it.effect("with a token set, reads the unread notifications from the official API with it", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])
      yield* (yield* GitHubTokenStore).save("ghp_secret")
      yield* (yield* FakeHttp).route("https://api.github.com/notifications", () =>
        Effect.succeed(
          httpResponse(
            200,
            JSON.stringify([
              notificationThread("2", "2026-11-16T08:00:00Z"),
              notificationThread("1", "2026-11-15T08:00:00Z"),
            ]),
          ),
        ),
      )

      const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(notifications))

      const requests = yield* (yield* FakeHttp).requests
      assert.deepStrictEqual(
        [
          items.map((item) => item.url),
          requests.map((request) => [request.headers?.["Authorization"], request.credentials]),
        ],
        [
          [
            "https://github.com/katip-dev/katip/issues/2",
            "https://github.com/katip-dev/katip/issues/1",
          ],
          [["Bearer ghp_secret", "omit"]],
        ],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("without a token, fails as needing one without sending a request", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN, GITHUB_API_ORIGIN])

      const failure = yield* fetchFailure(notifications)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "TokenMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("without access to the official API, fails without sending a request", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN])
      yield* (yield* GitHubTokenStore).save("ghp_secret")

      const failure = yield* fetchFailure(notifications)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "PermissionMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("fails as unable to read notifications when GitHub refuses the token for them", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])
      yield* (yield* GitHubTokenStore).save("github_pat_fine_grained")
      yield* (yield* FakeHttp).route("https://api.github.com/", () =>
        Effect.succeed(
          httpResponse(403, '{"message":"Resource not accessible by personal access token"}'),
        ),
      )

      assert.deepStrictEqual(yield* fetchFailure(notifications), {
        _tag: "TokenCannotReadNotifications",
      })
    }).pipe(Effect.provide(TestLayer)),
  )
})
