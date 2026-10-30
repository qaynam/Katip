import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse } from "#platform/http"
import {
  githubItemsFrom,
  githubSearchesFor,
  githubSearchRequest,
  mergeSearchResults,
  parseGitHubSearch,
} from "./github-search"
import type { GitHubQuery, LiveItem } from "./live-source"

const NOW = Date.UTC(2026, 9, 30, 9, 0, 0)

const searchItem = (overrides: Record<string, unknown> = {}) => ({
  url: "https://api.github.com/repos/katip-dev/katip/issues/42",
  repository_url: "https://api.github.com/repos/katip-dev/katip",
  labels_url: "https://api.github.com/repos/katip-dev/katip/issues/42/labels{/name}",
  html_url: "https://github.com/katip-dev/katip/pull/42",
  id: 2876543210,
  node_id: "PR_kwDOLx3k9c6Fq2Zt",
  number: 42,
  title: "ライブフォルダを追加する",
  user: { login: "hanako", id: 1029384, type: "User" },
  labels: [],
  state: "open",
  locked: false,
  assignee: null,
  comments: 3,
  created_at: "2026-10-28T02:11:09Z",
  updated_at: "2026-10-30T08:55:41Z",
  closed_at: null,
  author_association: "MEMBER",
  draft: false,
  pull_request: {
    url: "https://api.github.com/repos/katip-dev/katip/pulls/42",
    html_url: "https://github.com/katip-dev/katip/pull/42",
    merged_at: null,
  },
  body: "ライブフォルダの background 側",
  score: 1,
  ...overrides,
})

const searchBody = (items: ReadonlyArray<unknown>) =>
  JSON.stringify({ total_count: items.length, incomplete_results: false, items })

const liveItem = (id: string, updatedAt: number): LiveItem => ({
  id,
  title: id,
  subtitle: "",
  url: `https://github.com/o/r/issues/${id}`,
  updatedAt,
})

describe("検索式", () => {
  it.each<[GitHubQuery, ReadonlyArray<string>]>([
    ["review-requested", ["is:pr is:open review-requested:@me archived:false"]],
    ["authored-pull-requests", ["is:pr is:open author:@me archived:false"]],
    ["assigned-issues", ["is:issue is:open assignee:@me archived:false"]],
    [
      "mentioned",
      ["is:issue is:open mentions:@me archived:false", "is:pr is:open mentions:@me archived:false"],
    ],
  ])("%s は、開いているものだけを対象に検索する", (query, expected) => {
    expect(githubSearchesFor(query)).toStrictEqual(expected)
  })
})

describe("検索の要求", () => {
  const request = githubSearchRequest("is:pr is:open author:@me", "ghp_secret")

  it("検索式を更新の新しい順で問い合わせる", () => {
    const url = new URL(request.url)

    expect([
      url.origin + url.pathname,
      url.searchParams.get("q"),
      url.searchParams.get("sort"),
      url.searchParams.get("order"),
    ]).toStrictEqual([
      "https://api.github.com/search/issues",
      "is:pr is:open author:@me",
      "updated",
      "desc",
    ])
  })

  it("トークンで認証し、ブラウザの cookie は送らない", () => {
    expect([request.headers?.["Authorization"], request.credentials]).toStrictEqual([
      "Bearer ghp_secret",
      "omit",
    ])
  })
})

describe("検索結果の解析", () => {
  it("Issue やプルリクエストが、リポジトリと番号を補足に持つ項目になる", () => {
    const items = parseGitHubSearch(searchBody([searchItem()]))

    expect(items).toStrictEqual(
      Option.some([
        {
          id: "2876543210",
          title: "ライブフォルダを追加する",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42",
          updatedAt: Date.UTC(2026, 9, 30, 8, 55, 41),
        },
      ]),
    )
  })

  it("該当が無ければ空になる", () => {
    expect(parseGitHubSearch(searchBody([]))).toStrictEqual(Option.some([]))
  })

  it("形の合わない項目だけを除き、ほかの項目は残す", () => {
    const body = searchBody([
      searchItem({ id: 1, title: null }),
      searchItem({ id: 2, updated_at: "not a date" }),
      searchItem({ id: 3 }),
    ])

    expect(Option.map(parseGitHubSearch(body), (items) => items.map((i) => i.id))).toStrictEqual(
      Option.some(["3"]),
    )
  })

  it("リンクが https でない項目は除く", () => {
    const body = searchBody([
      searchItem({ id: 1, html_url: "javascript:alert(1)" }),
      searchItem({ id: 2 }),
    ])

    expect(Option.map(parseGitHubSearch(body), (items) => items.map((i) => i.id))).toStrictEqual(
      Option.some(["2"]),
    )
  })

  it("JSON でない本文や項目の一覧の無い本文は読めない", () => {
    expect([
      parseGitHubSearch("<html>Bad gateway</html>"),
      parseGitHubSearch(JSON.stringify({ message: "Validation Failed" })),
    ]).toStrictEqual([Option.none(), Option.none()])
  })
})

describe("複数の検索結果の統合", () => {
  it("両方に現れた項目は 1 つにまとめ、更新の新しい順に並べる", () => {
    const merged = mergeSearchResults([
      [liveItem("a", 1), liveItem("b", 3)],
      [liveItem("b", 3), liveItem("c", 2)],
    ])

    expect(merged.map((item) => item.id)).toStrictEqual(["b", "c", "a"])
  })
})

describe("検索の応答の判定", () => {
  it("成功すれば項目が取り込まれる", () => {
    const result = githubItemsFrom(httpResponse(200, searchBody([searchItem()])), NOW)

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("成功の応答でも読めない本文なら、読み取れないと判定する", () => {
    expect(githubItemsFrom(httpResponse(200, "{"), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })

  it("トークンを受け付けられなかったら、トークンが無効と判定する", () => {
    expect(githubItemsFrom(httpResponse(401, '{"message":"Bad credentials"}'), NOW)).toStrictEqual(
      Result.fail({ _tag: "TokenRejected" }),
    )
  })

  it("回数の上限を使い切ったら、知らされた回復時刻まで待つ", () => {
    const response = httpResponse(403, '{"message":"API rate limit exceeded"}', {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1793350000",
    })

    expect(githubItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: 1793350000 * 1000 }),
    )
  })

  it("短時間に送りすぎたら、知らされた秒数だけ待つ", () => {
    const response = httpResponse(403, '{"message":"secondary rate limit"}', {
      "retry-after": "90",
      "x-ratelimit-remaining": "25",
    })

    expect(githubItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 90_000 }),
    )
  })

  it("待つ時間を知らされずに上限に達したら、1 分待つ", () => {
    expect(githubItemsFrom(httpResponse(429), NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 60_000 }),
    )
  })

  it("上限ではない拒否は、アクセスできないと判定する", () => {
    const response = httpResponse(403, '{"message":"Resource protected by SAML enforcement"}', {
      "x-ratelimit-remaining": "4999",
    })

    expect(githubItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("それ以外のエラー応答は、その状態コードで失敗する", () => {
    expect(githubItemsFrom(httpResponse(422), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 422 }),
    )
  })
})
