import { Array, DateTime, Option, Order, pipe, Record, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { isOpenableUrl, type GitHubQuery, type LiveItem } from "./live-source"

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
export const githubSearchesFor = (query: GitHubQuery): Array.NonEmptyReadonlyArray<string> =>
  searchesByQuery[query]

export const githubSearchRequest = (search: string, token: string): HttpRequest => ({
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
const decodeNumber = Schema.decodeUnknownOption(Schema.FiniteFromString)

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
 * 検索 API の応答本文から項目を取り出す。形の合わない項目と開けない URL の項目は除く。
 * 応答そのものが読めなければ None。
 */
export const parseGitHubSearch = (body: string): Option.Option<ReadonlyArray<LiveItem>> =>
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

const byNewestUpdate = Order.flip(Order.mapInput(Order.Number, (item: LiveItem) => item.updatedAt))

/** 複数の検索結果を、重複を除いて更新の新しい順に並べる。 */
export const mergeSearchResults = (
  results: ReadonlyArray<ReadonlyArray<LiveItem>>,
): ReadonlyArray<LiveItem> =>
  Array.sort(
    Array.dedupeWith(results.flat(), (a, b) => a.id === b.id),
    byNewestUpdate,
  )

const headerNumber = (response: HttpResponse, name: string) =>
  Option.flatMap(Record.get(response.headers, name), decodeNumber)

const FALLBACK_RATE_LIMIT_WAIT_MS = 60_000

// 一次の上限は残り回数と回復時刻（エポック秒）、二次の上限は retry-after（秒）で知らされる
const rateLimitRetryAt = (response: HttpResponse, now: number): Option.Option<number> => {
  if (response.status !== 403 && response.status !== 429) return Option.none()
  const afterRetryAfter = Option.map(
    headerNumber(response, "retry-after"),
    (seconds) => now + seconds * 1000,
  )
  const isExhausted = Option.contains(headerNumber(response, "x-ratelimit-remaining"), 0)
  const atReset = isExhausted
    ? Option.map(headerNumber(response, "x-ratelimit-reset"), (seconds) => seconds * 1000)
    : Option.none()
  return pipe(
    afterRetryAfter,
    Option.orElse(() => atReset),
    Option.orElse(() =>
      response.status === 429 || isExhausted
        ? Option.some(now + FALLBACK_RATE_LIMIT_WAIT_MS)
        : Option.none(),
    ),
  )
}

/** @param now - 上限に達したときの再開時刻を、待ち時間で知らされた場合の起点。 */
export const githubItemsFrom = (
  response: HttpResponse,
  now: number,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.status === 200) {
    return Result.fromOption(parseGitHubSearch(response.body), () => ({
      _tag: "UnreadableResponse" as const,
    }))
  }
  if (response.status === 401) return Result.fail({ _tag: "TokenRejected" })
  const retryAt = rateLimitRetryAt(response, now)
  if (Option.isSome(retryAt)) return Result.fail({ _tag: "RateLimited", retryAt: retryAt.value })
  if (response.status === 403) return Result.fail({ _tag: "AccessDenied", status: 403 })
  return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
}
