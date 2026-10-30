import { Array, DateTime, Option, pipe, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import { rateLimitRetryAt } from "./github-rate-limit"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { isOpenableUrl, type GitHubQuery, type LiveItem } from "./live-source"

/** トークンを使う公式 API に要るホストの許可。 */
export const GITHUB_API_ORIGIN = "https://api.github.com/*"

const searchesByQuery: Readonly<Record<GitHubQuery, Array.NonEmptyReadonlyArray<string>>> = {
  "review-requested": ["is:pr is:open review-requested:@me archived:false"],
  "authored-pull-requests": ["is:pr is:open author:@me archived:false"],
  "assigned-issues": ["is:issue is:open assignee:@me archived:false"],
  // 検索 API は is:issue と is:pr のどちらも含まない検索式を受け付けないので、2 回に分けて検索する
  mentioned: [
    "is:issue is:open mentions:@me archived:false",
    "is:pr is:open mentions:@me archived:false",
  ],
}

/** ライブフォルダ 1 つ分の検索式。複数あれば、すべての結果を合わせたものが中身になる。 */
export const githubApiSearchesFor = (query: GitHubQuery): Array.NonEmptyReadonlyArray<string> =>
  searchesByQuery[query]

export const githubApiSearchRequest = (search: string, token: string): HttpRequest => ({
  url: `https://api.github.com/search/issues?${new URLSearchParams({
    q: search,
    sort: "updated",
    order: "desc",
    per_page: "50",
  })}`,
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
  credentials: "omit",
})

const SearchResponse = Schema.fromJsonString(Schema.Struct({ items: Schema.Array(Schema.Unknown) }))

const SearchItem = Schema.Struct({
  id: Schema.Number,
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  repository_url: Schema.String,
  updated_at: Schema.DateTimeUtcFromString,
})
type SearchItem = typeof SearchItem.Type

const decodeResponse = Schema.decodeUnknownOption(SearchResponse)
const decodeItem = Schema.decodeUnknownOption(SearchItem)

// repository_url は https://api.github.com/repos/<owner>/<repo> の形
const repositoryNameOf = (repositoryUrl: string): string =>
  repositoryUrl.match(/\/repos\/([^/]+\/[^/]+)$/)?.[1] ?? repositoryUrl

const itemFrom = (item: SearchItem): LiveItem => ({
  id: String(item.id),
  title: item.title,
  subtitle: `${repositoryNameOf(item.repository_url)}#${item.number}`,
  url: item.html_url,
  updatedAt: DateTime.toEpochMillis(item.updated_at),
})

/**
 * 検索 API の応答本文から、更新の新しい順に項目を取り出す。形の合わない項目と開けない URL の
 * 項目は除く。応答そのものが読めなければ None。
 */
export const parseGitHubApiSearch = (body: string): Option.Option<ReadonlyArray<LiveItem>> =>
  Option.map(decodeResponse(body), ({ items }) =>
    Array.getSomes(
      items.map((raw) =>
        pipe(
          decodeItem(raw),
          Option.filter((item) => isOpenableUrl(item.html_url)),
          Option.map(itemFrom),
        ),
      ),
    ),
  )

/** @param now - 上限に達したときの再開時刻を、待ち時間で知らされた場合の起点。 */
export const githubApiItemsFrom = (
  response: HttpResponse,
  now: number,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.status === 200) {
    return Result.fromOption(parseGitHubApiSearch(response.body), () => ({
      _tag: "UnreadableResponse" as const,
    }))
  }
  if (response.status === 401) return Result.fail({ _tag: "TokenRejected" })
  const retryAt = rateLimitRetryAt(response, now)
  if (Option.isSome(retryAt)) return Result.fail({ _tag: "RateLimited", retryAt: retryAt.value })
  if (response.status === 403) return Result.fail({ _tag: "AccessDenied", status: 403 })
  return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
}
