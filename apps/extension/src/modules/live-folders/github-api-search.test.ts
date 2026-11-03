import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse } from "#platform/http"
import {
  githubApiItemsFrom,
  githubApiSearchesFor,
  githubApiSearchRequest,
  parseGitHubApiSearch,
} from "./github-api-search"
import type { GitHubQuery } from "./live-source"

const NOW = Date.UTC(2026, 9, 30, 9, 0, 0)

const searchItem = (overrides: Record<string, unknown> = {}) => ({
  url: "https://api.github.com/repos/katip-dev/katip/issues/42",
  repository_url: "https://api.github.com/repos/katip-dev/katip",
  labels_url: "https://api.github.com/repos/katip-dev/katip/issues/42/labels{/name}",
  html_url: "https://github.com/katip-dev/katip/pull/42",
  id: 2876543210,
  node_id: "PR_kwDOLx3k9c6Fq2Zt",
  number: 42,
  title: "Add live folders",
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
  body: "The background side of live folders",
  score: 1,
  ...overrides,
})

const searchBody = (items: ReadonlyArray<unknown>) =>
  JSON.stringify({ total_count: items.length, incomplete_results: false, items })

describe("official API search queries", () => {
  it.each<[GitHubQuery, ReadonlyArray<string>]>([
    ["review-requested", ["is:pr is:open review-requested:@me archived:false"]],
    ["authored-pull-requests", ["is:pr is:open author:@me archived:false"]],
    ["assigned-issues", ["is:issue is:open assignee:@me archived:false"]],
    [
      "mentioned",
      ["is:issue is:open mentions:@me archived:false", "is:pr is:open mentions:@me archived:false"],
    ],
  ])("%s searches only open items", (query, expected) => {
    expect(githubApiSearchesFor(query)).toStrictEqual(expected)
  })
})

describe("search requests to the official API", () => {
  const request = githubApiSearchRequest("is:pr is:open author:@me", "ghp_secret")

  it("asks for the query's results most recently updated first", () => {
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

  it("authenticates with the token and sends no browser cookies", () => {
    expect([request.headers?.["Authorization"], request.credentials]).toStrictEqual([
      "Bearer ghp_secret",
      "omit",
    ])
  })
})

describe("parsing official API search results", () => {
  it("turns issues and pull requests into items with the repository and number as the subtitle", () => {
    const items = parseGitHubApiSearch(searchBody([searchItem()]))

    expect(items).toStrictEqual(
      Option.some([
        {
          id: "2876543210",
          title: "Add live folders",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42",
          updatedAt: Date.UTC(2026, 9, 30, 8, 55, 41),
        },
      ]),
    )
  })

  it("is empty when nothing matches", () => {
    expect(parseGitHubApiSearch(searchBody([]))).toStrictEqual(Option.some([]))
  })

  it("leaves out only the items of the wrong shape, keeping the others", () => {
    const body = searchBody([
      searchItem({ id: 1, title: null }),
      searchItem({ id: 2, updated_at: "not a date" }),
      searchItem({ id: 3 }),
    ])

    expect(Option.map(parseGitHubApiSearch(body), (items) => items.map((i) => i.id))).toStrictEqual(
      Option.some(["3"]),
    )
  })

  it("leaves out items whose link isn't https", () => {
    const body = searchBody([
      searchItem({ id: 1, html_url: "javascript:alert(1)" }),
      searchItem({ id: 2 }),
    ])

    expect(Option.map(parseGitHubApiSearch(body), (items) => items.map((i) => i.id))).toStrictEqual(
      Option.some(["2"]),
    )
  })

  it("can't read a body that isn't JSON or has no list of items", () => {
    expect([
      parseGitHubApiSearch("<html>Bad gateway</html>"),
      parseGitHubApiSearch(JSON.stringify({ message: "Validation Failed" })),
    ]).toStrictEqual([Option.none(), Option.none()])
  })
})

describe("judging official API responses", () => {
  it("takes in the items on success", () => {
    const result = githubApiItemsFrom(httpResponse(200, searchBody([searchItem()])), NOW)

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("a successful response with an unreadable body is unreadable", () => {
    expect(githubApiItemsFrom(httpResponse(200, "{"), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })

  it("a token that isn't accepted is rejected", () => {
    expect(
      githubApiItemsFrom(httpResponse(401, '{"message":"Bad credentials"}'), NOW),
    ).toStrictEqual(Result.fail({ _tag: "TokenRejected" }))
  })

  it("after using up the request quota, waits until the reset time given", () => {
    const response = httpResponse(403, '{"message":"API rate limit exceeded"}', {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1793350000",
    })

    expect(githubApiItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: 1793350000 * 1000 }),
    )
  })

  it("after sending too much in a short time, waits the seconds given", () => {
    const response = httpResponse(403, '{"message":"secondary rate limit"}', {
      "retry-after": "90",
      "x-ratelimit-remaining": "25",
    })

    expect(githubApiItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 90_000 }),
    )
  })

  it("waits one minute when the limit is hit without saying how long to wait", () => {
    expect(githubApiItemsFrom(httpResponse(429), NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 60_000 }),
    )
  })

  it("a refusal that isn't the rate limit means access is denied", () => {
    const response = httpResponse(403, '{"message":"Resource protected by SAML enforcement"}', {
      "x-ratelimit-remaining": "4999",
    })

    expect(githubApiItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("any other error response fails with its status code", () => {
    expect(githubApiItemsFrom(httpResponse(422), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 422 }),
    )
  })
})
