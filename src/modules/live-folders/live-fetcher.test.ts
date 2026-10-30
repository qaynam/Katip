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

const gmailFeed = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@example.com</title><fullcount>1</fullcount><entry><title>請求書の送付</title><link rel="alternate" href="https://mail.google.com/mail?account_id=taro.yamada@example.com&amp;message_id=19a&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><issued>2026-10-30T09:10:01Z</issued><id>tag:gmail.google.com,2004:1</id><author><name>経理部</name><email>keiri@example.co.jp</email></author></entry></feed>`

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

const fetchFailure = (source: LiveSource) =>
  Effect.map(
    Effect.flip(LiveFetcher.use((fetcher) => fetcher.fetch(source))),
    (error) => error.failure,
  )

describe("アクセスの許可", () => {
  it.effect("取得元へのアクセスが許可されていなければ、要求を送らずに失敗する", () =>
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
  it.effect("許可されていれば、ログイン中の cookie 付きでフィードを読んで項目を返す", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", () =>
        Effect.succeed(httpResponse(200, gmailFeed)),
      )

      const items = yield* LiveFetcher.use((fetcher) => fetcher.fetch(inbox))

      const [request] = yield* (yield* FakeHttp).requests
      assert.deepStrictEqual(
        [items.map((item) => [item.title, item.subtitle]), request?.credentials],
        [[["請求書の送付", "経理部"]], "include"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("接続できなければ、接続できなかったとして失敗する", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", unreachable)

      assert.deepStrictEqual(yield* fetchFailure(inbox), { _tag: "Unreachable" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("応答が 30 秒返らなければ、接続できなかったとして打ち切る", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GMAIL_ORIGIN])
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Effect.never)
      const fetching = yield* Effect.forkChild(fetchFailure(inbox))

      yield* TestClock.adjust("30 seconds")

      assert.deepStrictEqual(yield* Fiber.join(fetching), { _tag: "Unreachable" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("GitHub（ログイン中のセッション）", () => {
  it.effect(
    "トークンが無ければ、検索画面をログイン中の cookie 付きで読み、プルリクエストと Issue の結果を合わせる",
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

  it.effect("github.com へのアクセスが許可されていなければ、要求を送らずに失敗する", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])

      const failure = yield* fetchFailure(mentioned)

      assert.deepStrictEqual(
        [failure, yield* (yield* FakeHttp).requests],
        [{ _tag: "PermissionMissing" }, []],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("ログインしていなければ、ログインしていないとして失敗する", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_ORIGIN])
      yield* (yield* FakeHttp).route("https://github.com/search", () =>
        Effect.succeed(httpResponse(200, webPage([], false))),
      )

      assert.deepStrictEqual(yield* fetchFailure(mentioned), { _tag: "NotSignedIn" })
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("GitHub（トークン）", () => {
  it.effect(
    "トークンが設定されていれば公式 API をトークンで検索し、結果を更新の新しい順にまとめる",
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

  it.effect("公式 API へのアクセスが許可されていなければ、要求を送らずに失敗する", () =>
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

  it.effect("トークンを受け付けられなければ、トークンが無効として失敗する", () =>
    Effect.gen(function* () {
      yield* (yield* FakePermissions).grant([GITHUB_API_ORIGIN])
      yield* (yield* GitHubTokenStore).save("ghp_revoked")
      yield* (yield* FakeHttp).route("https://api.github.com/", () =>
        Effect.succeed(httpResponse(401, '{"message":"Bad credentials"}')),
      )

      assert.deepStrictEqual(yield* fetchFailure(mentioned), { _tag: "TokenRejected" })
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("空のトークンを保存するとトークンが消え、ログイン中のセッションで読む", () =>
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
