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
  hl_text: "The <em>background</em> side of live folders",
  hl_title: "Add <em>live folders</em>",
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

describe("web search queries", () => {
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
  ])("%s searches open items, most recently updated first", (query, expected) => {
    expect(githubWebSearchesFor(query)).toStrictEqual(expected)
  })
})

describe("web search requests", () => {
  const request = githubWebSearchRequest(pullRequests)

  it("asks for the search page's results as JSON, giving the query and the result kind", () => {
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

  it("sends the signed-in session's cookies and doesn't follow a redirect to the sign-in page", () => {
    expect([request.credentials, request.redirect]).toStrictEqual(["include", "manual"])
  })
})

describe("parsing web search results", () => {
  it("turns a pull request into an item with the repository and number as the subtitle, opening the pull request's page", () => {
    expect(itemsOf(searchPage([searchResult()]))).toStrictEqual(
      Option.some([
        {
          id: "katip-dev/katip#42",
          title: "Add live folders",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42",
          updatedAt: Date.UTC(2026, 9, 28, 2, 11, 9),
        },
      ]),
    )
  })

  it("results of an issue search open the issue's page", () => {
    const items = itemsOf(searchPage([searchResult({ number: 7 })]), {
      type: "issues",
      query: "is:open is:issue assignee:@me",
    })

    expect(Option.map(items, (all) => all.map((item) => item.url))).toStrictEqual(
      Option.some(["https://github.com/katip-dev/katip/issues/7"]),
    )
  })

  it("strips match highlighting from the title and decodes character references", () => {
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

  it("keeps the results in the query's order (most recently updated first)", () => {
    const body = searchPage([
      searchResult({ number: 1, created: "2026-01-01T00:00:00Z" }),
      searchResult({ number: 2, created: "2026-10-01T00:00:00Z" }),
    ])

    expect(Option.map(itemsOf(body), (items) => items.map((item) => item.id))).toStrictEqual(
      Option.some(["katip-dev/katip#1", "katip-dev/katip#2"]),
    )
  })

  it("is empty when nothing matches", () => {
    expect(itemsOf(searchPage([]))).toStrictEqual(Option.some([]))
  })

  it("treats the whole response as unreadable when even one result has the wrong shape", () => {
    const body = searchPage([searchResult(), searchResult({ repo: { name: "katip" } })])

    expect(itemsOf(body)).toStrictEqual(Option.none())
  })

  it("can't read a body that isn't JSON or has no search results", () => {
    expect([
      itemsOf("<!DOCTYPE html><html><body>Sign in to GitHub</body></html>"),
      itemsOf(JSON.stringify({ payload: { repository: {} } })),
    ]).toStrictEqual([Option.none(), Option.none()])
  })

  it("reads whether the user is signed in", () => {
    expect(
      Option.map(
        parseGitHubWebSearch(searchPage([], { loggedIn: false }), "issues"),
        (page) => page.isLoggedIn,
      ),
    ).toStrictEqual(Option.some(false))
  })
})

describe("judging web search responses", () => {
  it("takes in the items when signed in and the results are readable", () => {
    const result = githubWebItemsFrom(
      httpResponse(200, searchPage([searchResult()])),
      pullRequests,
      NOW,
    )

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("a response saying the user is signed out means not signed in", () => {
    const response = httpResponse(200, searchPage([], { loggedIn: false }))

    expect(githubWebItemsFrom(response, pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "NotSignedIn" }),
    )
  })

  it("a redirect or a request for authentication means not signed in", () => {
    expect([
      githubWebItemsFrom(redirectResponse, pullRequests, NOW),
      githubWebItemsFrom(httpResponse(401), pullRequests, NOW),
    ]).toStrictEqual([Result.fail({ _tag: "NotSignedIn" }), Result.fail({ _tag: "NotSignedIn" })])
  })

  it("when refused for sending too much, waits the seconds given", () => {
    const response = httpResponse(429, "Too many requests", { "retry-after": "30" })

    expect(githubWebItemsFrom(response, pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 30_000 }),
    )
  })

  it("a refusal means access is denied", () => {
    expect(githubWebItemsFrom(httpResponse(403), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("any other error response fails with its status code", () => {
    expect(githubWebItemsFrom(httpResponse(500), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 500 }),
    )
  })

  it("a successful response with an unreadable body is unreadable", () => {
    expect(githubWebItemsFrom(httpResponse(200, "{}"), pullRequests, NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })
})
