import { Option, Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse } from "#platform/http"
import {
  githubNotificationItemsFrom,
  githubNotificationsRequest,
  parseGitHubNotifications,
} from "./github-notifications"

const NOW = Date.UTC(2026, 10, 16, 9, 0, 0)

const thread = (overrides: Record<string, unknown> = {}) => ({
  id: "14820937465",
  unread: true,
  reason: "review_requested",
  updated_at: "2026-11-16T08:41:12Z",
  last_read_at: null,
  subject: {
    title: "Add a notifications live folder",
    url: "https://api.github.com/repos/katip-dev/katip/pulls/42",
    latest_comment_url: "https://api.github.com/repos/katip-dev/katip/pulls/42",
    type: "PullRequest",
  },
  repository: {
    id: 712345678,
    node_id: "R_kgDOKnB3Tg",
    name: "katip",
    full_name: "katip-dev/katip",
    private: false,
    owner: { login: "katip-dev", id: 1029384, type: "Organization" },
    html_url: "https://github.com/katip-dev/katip",
  },
  url: "https://api.github.com/notifications/threads/14820937465",
  subscription_url: "https://api.github.com/notifications/threads/14820937465/subscription",
  ...overrides,
})

const subject = (type: string, url: string | null) => ({
  title: `A ${type}`,
  url,
  latest_comment_url: url,
  type,
})

const urlsOf = (body: string) =>
  Option.map(parseGitHubNotifications(body), (items) => items.map((item) => item.url))

describe("notifications requests to the official API", () => {
  const request = githubNotificationsRequest("ghp_secret")

  it("asks for the unread threads of the inbox, as many as one page holds", () => {
    const url = new URL(request.url)

    expect([
      url.origin + url.pathname,
      url.searchParams.get("all"),
      url.searchParams.get("per_page"),
    ]).toStrictEqual(["https://api.github.com/notifications", "false", "50"])
  })

  it("authenticates with the token and sends no browser cookies", () => {
    expect([request.headers?.["Authorization"], request.credentials]).toStrictEqual([
      "Bearer ghp_secret",
      "omit",
    ])
  })

  it("never answers from the browser's cache, which would keep what has since been read", () => {
    expect(request.cache).toBe("no-store")
  })
})

describe("parsing notifications", () => {
  it("turns a thread into an item titled after its subject, with the repository and number as the subtitle, and the owner's avatar as the icon", () => {
    expect(parseGitHubNotifications(JSON.stringify([thread()]))).toStrictEqual(
      Option.some([
        {
          id: "14820937465",
          title: "Add a notifications live folder",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42",
          updatedAt: Date.UTC(2026, 10, 16, 8, 41, 12),
          icon: { _tag: "Image", url: "https://github.com/katip-dev.png?size=40" },
        },
      ]),
    )
  })

  it("opens the page of each thread's issue, pull request or commit", () => {
    const body = JSON.stringify([
      thread({
        subject: subject("Issue", "https://api.github.com/repos/katip-dev/katip/issues/7"),
      }),
      thread({
        subject: subject("PullRequest", "https://api.github.com/repos/katip-dev/katip/pulls/8"),
      }),
      thread({
        subject: subject(
          "Commit",
          "https://api.github.com/repos/katip-dev/katip/commits/9f3c2a1b7e5d4c6a8b0e1f2d3c4b5a6978877665",
        ),
      }),
    ])

    expect(urlsOf(body)).toStrictEqual(
      Option.some([
        "https://github.com/katip-dev/katip/issues/7",
        "https://github.com/katip-dev/katip/pull/8",
        "https://github.com/katip-dev/katip/commit/9f3c2a1b7e5d4c6a8b0e1f2d3c4b5a6978877665",
      ]),
    )
  })

  it("opens the repository's releases for a release, whose own page the API doesn't name", () => {
    const body = JSON.stringify([
      thread({
        subject: subject("Release", "https://api.github.com/repos/katip-dev/katip/releases/180424"),
      }),
    ])

    expect(urlsOf(body)).toStrictEqual(Option.some(["https://github.com/katip-dev/katip/releases"]))
  })

  it("opens the notifications inbox for a thread whose page it can't tell", () => {
    const body = JSON.stringify([
      thread({ subject: subject("Discussion", null) }),
      thread({ subject: subject("CheckSuite", "https://api.github.com/repos/katip-dev/katip") }),
      thread({ subject: subject("Issue", "https://evil.example/repos/katip-dev/katip/issues/7") }),
    ])

    expect(urlsOf(body)).toStrictEqual(
      Option.some([
        "https://github.com/notifications",
        "https://github.com/notifications",
        "https://github.com/notifications",
      ]),
    )
  })

  it("gives only the repository as the subtitle of a thread that has no number", () => {
    const body = JSON.stringify([thread({ subject: subject("Discussion", null) })])

    expect(
      Option.map(parseGitHubNotifications(body), (items) => items.map((item) => item.subtitle)),
    ).toStrictEqual(Option.some(["katip-dev/katip"]))
  })

  it("is empty when no notification is unread", () => {
    expect(parseGitHubNotifications("[]")).toStrictEqual(Option.some([]))
  })

  it("leaves out only the threads of the wrong shape, keeping the others", () => {
    const body = JSON.stringify([
      thread({ id: 1 }),
      thread({ id: "2", updated_at: "not a date" }),
      thread({ id: "3", subject: { url: null, type: "Issue" } }),
      thread({ id: "4", repository: null }),
      thread({ id: "5" }),
    ])

    expect(
      Option.map(parseGitHubNotifications(body), (items) => items.map((item) => item.id)),
    ).toStrictEqual(Option.some(["5"]))
  })

  it("can't read a body that isn't JSON or isn't a list of threads", () => {
    expect([
      parseGitHubNotifications("<html>Bad gateway</html>"),
      parseGitHubNotifications(JSON.stringify({ message: "Not Found" })),
    ]).toStrictEqual([Option.none(), Option.none()])
  })
})

describe("judging official API notifications responses", () => {
  it("takes in the threads on success", () => {
    const result = githubNotificationItemsFrom(httpResponse(200, JSON.stringify([thread()])), NOW)

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("a successful response with an unreadable body is unreadable", () => {
    expect(githubNotificationItemsFrom(httpResponse(200, "{"), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })

  it("a token that isn't accepted is rejected", () => {
    expect(
      githubNotificationItemsFrom(httpResponse(401, '{"message":"Bad credentials"}'), NOW),
    ).toStrictEqual(Result.fail({ _tag: "TokenRejected" }))
  })

  it("a fine-grained token, which GitHub refuses for notifications, can't read them", () => {
    const response = httpResponse(
      403,
      '{"message":"Resource not accessible by personal access token"}',
      { "x-ratelimit-remaining": "4999" },
    )

    expect(githubNotificationItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "TokenCannotReadNotifications" }),
    )
  })

  it("a token GitHub hides the inbox from can't read notifications", () => {
    expect(
      githubNotificationItemsFrom(httpResponse(404, '{"message":"Not Found"}'), NOW),
    ).toStrictEqual(Result.fail({ _tag: "TokenCannotReadNotifications" }))
  })

  it("after using up the request quota, waits until the reset time given", () => {
    const response = httpResponse(403, '{"message":"API rate limit exceeded"}', {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1794820000",
    })

    expect(githubNotificationItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: 1794820000 * 1000 }),
    )
  })

  it("any other error response fails with its status code", () => {
    expect(githubNotificationItemsFrom(httpResponse(422), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 422 }),
    )
  })
})
