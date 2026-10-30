import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse, redirectResponse } from "#platform/http"
import {
  githubWebItemsFrom,
  githubWebSearchesFor,
  githubWebSearchRequest,
  parseGitHubWebSearch,
  type GitHubWebSearch,
} from "./github-web-search"
import type { GitHubQuery } from "./live-source"

const NOW = Date.UTC(2026, 9, 30, 9, 0, 0)

const pullRequests: GitHubWebSearch = {
  type: "pullrequests",
  query: "is:open is:pr review-requested:@me archived:false sort:updated-desc",
}

const searchResult = (overrides: Record<string, unknown> = {}) => ({
  id: "2876543210",
  num_comments: 3,
  created: "2026-10-28T02:11:09.000Z",
  hl_text: "ライブフォルダの <em>background</em> 側",
  hl_title: "<em>ライブフォルダ</em>を追加する",
  labels: [],
  language: "TypeScript",
  number: 42,
  repo: {
    repository: {
      id: 712345678,
      name: "katip",
      owner_id: 1029384,
      owner_login: "katip-dev",
      updated_at: "2026-10-30T08:55:41.000Z",
      has_issues: true,
    },
  },
  state: "open",
  author_name: "hanako",
  issue: { issue: { pull_request_id: 1987654321 } },
  merged: false,
  ...overrides,
})

const searchPage = (
  results: ReadonlyArray<unknown>,
  { loggedIn = true }: { readonly loggedIn?: boolean } = {},
) =>
  JSON.stringify({
    meta: { title: "Pull request search results" },
    payload: {
      blackbirdSearchRoute: {
        results,
        type: "pullrequests",
        page: 1,
        page_count: 1,
        elapsed_millis: 87,
        errors: [],
        result_count: results.length,
        facets: [],
        protected_org_logins: [],
        logged_in: loggedIn,
        sign_up_path: "/signup?source=code_search_results",
        sign_in_path: "/login?return_to=https%3A%2F%2Fgithub.com%2Fsearch",
        warn_limited_results: false,
      },
    },
  })

const itemsOf = (body: string, search: GitHubWebSearch = pullRequests) =>
  Option.map(parseGitHubWebSearch(body, search.type), (page) => page.items)

describe("画面の検索の検索式", () => {
  it.each<[GitHubQuery, ReadonlyArray<GitHubWebSearch>]>([
    [
      "review-requested",
      [
        {
          type: "pullrequests",
          query: "is:open is:pr review-requested:@me archived:false sort:updated-desc",
        },
      ],
    ],
    [
      "authored-pull-requests",
      [
        {
          type: "pullrequests",
          query: "is:open is:pr author:@me archived:false sort:updated-desc",
        },
      ],
    ],
    [
      "assigned-issues",
      [{ type: "issues", query: "is:open is:issue assignee:@me archived:false sort:updated-desc" }],
    ],
    [
      "mentioned",
      [
        { type: "pullrequests", query: "is:open mentions:@me archived:false sort:updated-desc" },
        { type: "issues", query: "is:open mentions:@me archived:false sort:updated-desc" },
      ],
    ],
  ])("%s は、開いているものを更新の新しい順に検索する", (query, expected) => {
    expect(githubWebSearchesFor(query)).toStrictEqual(expected)
  })
})

describe("画面の検索の要求", () => {
  const request = githubWebSearchRequest(pullRequests)

  it("検索式と結果の種類を指定して、検索画面の結果を JSON で求める", () => {
    const url = new URL(request.url)

    expect([
      url.origin + url.pathname,
      url.searchParams.get("q"),
      url.searchParams.get("type"),
      request.headers?.["Accept"],
    ]).toStrictEqual([
      "https://github.com/search",
      pullRequests.query,
      "pullrequests",
      "application/json",
    ])
  })

  it("ログイン中のセッションの cookie を付け、ログイン画面へのリダイレクトはたどらない", () => {
    expect([request.credentials, request.redirect]).toStrictEqual(["include", "manual"])
  })
})

describe("画面の検索の結果の解析", () => {
  it("プルリクエストが、リポジトリと番号を補足に持ち、プルリクエストの画面を開く項目になる", () => {
    expect(itemsOf(searchPage([searchResult()]))).toStrictEqual(
      Option.some([
        {
          id: "katip-dev/katip#42",
          title: "ライブフォルダを追加する",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42",
          updatedAt: Date.UTC(2026, 9, 28, 2, 11, 9),
        },
      ]),
    )
  })

  it("Issue の検索の結果は、Issue の画面を開く", () => {
    const items = itemsOf(searchPage([searchResult({ number: 7 })]), {
      type: "issues",
      query: "is:open is:issue assignee:@me",
    })

    expect(Option.map(items, (all) => all.map((item) => item.url))).toStrictEqual(
      Option.some(["https://github.com/katip-dev/katip/issues/7"]),
    )
  })

  it("件名は一致箇所の強調を外し、文字参照を元の文字に戻す", () => {
    const body = searchPage([
      searchResult({
        hl_title:
          "Fix &lt;Button&gt; &amp; <em>input</em> &#39;focus&#39; &#x2014; <mark>a11y</mark>",
      }),
    ])

    expect(Option.map(itemsOf(body), (items) => items.map((item) => item.title))).toStrictEqual(
      Option.some(["Fix <Button> & input 'focus' — a11y"]),
    )
  })

  it("結果は検索式の並び（更新の新しい順）のまま並ぶ", () => {
    const body = searchPage([
      searchResult({ number: 1, created: "2026-01-01T00:00:00Z" }),
      searchResult({ number: 2, created: "2026-10-01T00:00:00Z" }),
    ])

    expect(Option.map(itemsOf(body), (items) => items.map((item) => item.id))).toStrictEqual(
      Option.some(["katip-dev/katip#1", "katip-dev/katip#2"]),
    )
  })

  it("該当が無ければ空になる", () => {
    expect(itemsOf(searchPage([]))).toStrictEqual(Option.some([]))
  })

  it("1 件でも形の合わない結果があれば、応答全体を読めないものとする", () => {
    const body = searchPage([searchResult(), searchResult({ repo: { name: "katip" } })])

    expect(itemsOf(body)).toStrictEqual(Option.none())
  })

  it("JSON でない本文や、検索の結果を持たない本文は読めない", () => {
    expect([
      itemsOf("<!DOCTYPE html><html><body>Sign in to GitHub</body></html>"),
      itemsOf(JSON.stringify({ payload: { repository: {} } })),
    ]).toStrictEqual([Option.none(), Option.none()])
  })

  it("ログインしているかどうかを読み取る", () => {
    expect(
      Option.map(
        parseGitHubWebSearch(searchPage([], { loggedIn: false }), "issues"),
        (page) => page.isLoggedIn,
      ),
    ).toStrictEqual(Option.some(false))
  })
})

describe("画面の検索の応答の判定", () => {
  it("ログインしていて結果を読めれば、項目が取り込まれる", () => {
    const result = githubWebItemsFrom(
      httpResponse(200, searchPage([searchResult()])),
      pullRequests,
      NOW,
    )

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("ログインしていないと返されたら、ログインしていないと判定する", () => {
    const response = httpResponse(200, searchPage([], { loggedIn: false }))

    expect(githubWebItemsFrom(response, pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("リダイレクトされたり認証を求められたりしたら、ログインしていないと判定する", () => {
    expect([
      githubWebItemsFrom(redirectResponse, pullRequests, NOW),
      githubWebItemsFrom(httpResponse(401), pullRequests, NOW),
    ]).toStrictEqual([Result.fail({ _tag: "NotSignedIn" }), Result.fail({ _tag: "NotSignedIn" })])
  })

  it("送りすぎで断られたら、知らされた秒数だけ待つ", () => {
    const response = httpResponse(429, "Too many requests", { "retry-after": "30" })

    expect(githubWebItemsFrom(response, pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 30_000 }),
    )
  })

  it("拒否されたら、アクセスできないと判定する", () => {
    expect(githubWebItemsFrom(httpResponse(403), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("それ以外のエラー応答は、その状態コードで失敗する", () => {
    expect(githubWebItemsFrom(httpResponse(500), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 500 }),
    )
  })

  it("成功の応答でも読めない本文なら、読み取れないと判定する", () => {
    expect(githubWebItemsFrom(httpResponse(200, "{}"), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })
})
