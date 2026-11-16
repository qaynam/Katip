import { Array, DateTime, Option, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import { rateLimitRetryAt } from "./github-rate-limit"
import { plainTextOf } from "./html-scan"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { githubAvatarIcon, type GitHubSearchQuery, type LiveItem } from "./live-source"

/** The result kind chosen on github.com's search page (`type` in the URL). */
export type GitHubWebSearchType = "pullrequests" | "issues"

export interface GitHubWebSearch {
  readonly type: GitHubWebSearchType
  readonly query: string
}

const searchesByQuery: Readonly<
  Record<GitHubSearchQuery, Array.NonEmptyReadonlyArray<GitHubWebSearch>>
> = {
  "review-requested": [
    {
      type: "pullrequests",
      query: "is:open is:pr review-requested:@me archived:false sort:updated-desc",
    },
  ],
  "authored-pull-requests": [
    { type: "pullrequests", query: "is:open is:pr author:@me archived:false sort:updated-desc" },
  ],
  "assigned-issues": [
    { type: "issues", query: "is:open is:issue assignee:@me archived:false sort:updated-desc" },
  ],
  // Not one search: the web search returns pull requests and issues as separate result kinds
  mentioned: [
    { type: "pullrequests", query: "is:open mentions:@me archived:false sort:updated-desc" },
    { type: "issues", query: "is:open mentions:@me archived:false sort:updated-desc" },
  ],
}

/** The searches for one live folder. With several, the folder holds all their results. */
export const githubWebSearchesFor = (
  query: GitHubSearchQuery,
): Array.NonEmptyReadonlyArray<GitHubWebSearch> => searchesByQuery[query]

/**
 * Reads the results of github.com's search page as JSON, with the signed-in session's cookies.
 *
 * Reads the web search rather than the official API so that it works without a token. The response
 * shape isn't published and can change without notice, so a response that can't be read fails as
 * unreadable, making the breakage visible.
 */
export const githubWebSearchRequest = (search: GitHubWebSearch): HttpRequest => ({
  url: `https://github.com/search?${new URLSearchParams({ q: search.query, type: search.type })}`,
  headers: { Accept: "application/json" },
  credentials: "include",
  redirect: "manual",
  // Not the browser's cache: a copy kept there would go on listing what has since been closed
  cache: "no-store",
})

const SearchResult = Schema.Struct({
  hl_title: Schema.String,
  number: Schema.Number,
  created: Schema.DateTimeUtcFromString,
  repo: Schema.Struct({
    repository: Schema.Struct({ name: Schema.String, owner_login: Schema.String }),
  }),
})
type SearchResult = typeof SearchResult.Type

const SearchPage = Schema.fromJsonString(
  Schema.Struct({
    payload: Schema.Struct({
      blackbirdSearchRoute: Schema.Struct({
        logged_in: Schema.Boolean,
        results: Schema.Array(SearchResult),
      }),
    }),
  }),
)

const decodePage = Schema.decodeUnknownOption(SearchPage)

const itemFrom =
  (type: GitHubWebSearchType) =>
  (result: SearchResult): LiveItem => {
    const { owner_login: owner, name } = result.repo.repository
    const repository = `${owner}/${name}`
    const kind = type === "pullrequests" ? "pull" : "issues"
    return {
      id: `${repository}#${result.number}`,
      title: plainTextOf(result.hl_title),
      subtitle: `${repository}#${result.number}`,
      url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${kind}/${result.number}`,
      // The web search results have no update time. The query's update order decides the order,
      // and the creation time stands in for the time
      updatedAt: DateTime.toEpochMillis(result.created),
      icon: githubAvatarIcon(owner),
    }
  }

export interface GitHubWebSearchPage {
  readonly isLoggedIn: boolean
  /** In the query's order (most recently updated first). */
  readonly items: ReadonlyArray<LiveItem>
}

/**
 * Reads a web search response body. If even one result has the wrong shape, the whole response
 * counts as unreadable and it's None.
 */
export const parseGitHubWebSearch = (
  body: string,
  type: GitHubWebSearchType,
): Option.Option<GitHubWebSearchPage> =>
  Option.map(decodePage(body), ({ payload: { blackbirdSearchRoute: route } }) => ({
    isLoggedIn: route.logged_in,
    items: route.results.map(itemFrom(type)),
  }))

/** @param now - What the retry time counts from when the rate limit gives it as a wait. */
export const githubWebItemsFrom = (
  response: HttpResponse,
  search: GitHubWebSearch,
  now: number,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.isRedirect || response.status === 401) return Result.fail({ _tag: "NotSignedIn" })
  const retryAt = rateLimitRetryAt(response, now)
  if (Option.isSome(retryAt)) return Result.fail({ _tag: "RateLimited", retryAt: retryAt.value })
  if (response.status === 403) return Result.fail({ _tag: "AccessDenied", status: 403 })
  if (response.status !== 200) {
    return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
  }
  return Option.match(parseGitHubWebSearch(response.body, search.type), {
    onNone: () => Result.fail({ _tag: "UnreadableResponse" }),
    // Signed out, a query with @me doesn't fail; it just comes back empty
    onSome: (page) =>
      page.isLoggedIn ? Result.succeed(page.items) : Result.fail({ _tag: "NotSignedIn" }),
  })
}
