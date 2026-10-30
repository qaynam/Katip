import { Array, DateTime, Option, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import { rateLimitRetryAt } from "./github-rate-limit"
import type { LiveFetchFailure } from "./live-fetch-failure"
import type { GitHubQuery, LiveItem } from "./live-source"

/** github.com の検索画面の、結果の種類の切り替え（URL の `type`）。 */
export type GitHubWebSearchType = "pullrequests" | "issues"

export interface GitHubWebSearch {
  readonly type: GitHubWebSearchType
  readonly query: string
}

const searchesByQuery: Readonly<Record<GitHubQuery, Array.NonEmptyReadonlyArray<GitHubWebSearch>>> =
  {
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
    // 画面の検索はプルリクエストと Issue を別々の種類として返すので、両方を検索して合わせる
    mentioned: [
      { type: "pullrequests", query: "is:open mentions:@me archived:false sort:updated-desc" },
      { type: "issues", query: "is:open mentions:@me archived:false sort:updated-desc" },
    ],
  }

/** ライブフォルダ 1 つ分の検索。複数あれば、すべての結果を合わせたものが中身になる。 */
export const githubWebSearchesFor = (
  query: GitHubQuery,
): Array.NonEmptyReadonlyArray<GitHubWebSearch> => searchesByQuery[query]

/**
 * ログイン中のセッションの cookie で、github.com の検索画面の結果を JSON で読む。
 *
 * トークンを置かずに使えるよう公式 API ではなく画面の検索を読む。応答の形は公開されておらず
 * 予告なく変わりうるので、読めなければ読み取れないとして失敗させ、壊れたことが分かるようにする。
 */
export const githubWebSearchRequest = (search: GitHubWebSearch): HttpRequest => ({
  url: `https://github.com/search?${new URLSearchParams({ q: search.query, type: search.type })}`,
  headers: { Accept: "application/json" },
  credentials: "include",
  redirect: "manual",
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

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

const MAX_CODE_POINT = 0x10ffff

const decodeEntity = (reference: string, body: string): string => {
  const lower = body.toLowerCase()
  if (!lower.startsWith("#")) return namedEntities[lower] ?? reference
  const codePoint = lower.startsWith("#x")
    ? Number.parseInt(lower.slice(2), 16)
    : Number.parseInt(lower.slice(1), 10)
  return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : reference
}

// 一致箇所の強調（<em> など）を外すためのもの。属性の値に > を含むタグや、コメントは想定しない
const tagPattern = /<[^>]*>/g
const referencePattern = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi

/** 一致箇所に強調のタグが入った件名を、タグを外して文字参照を解いた文字列にする。 */
const plainTitleOf = (highlighted: string): string =>
  highlighted.replace(tagPattern, "").replace(referencePattern, decodeEntity)

const itemFrom =
  (type: GitHubWebSearchType) =>
  (result: SearchResult): LiveItem => {
    const { owner_login: owner, name } = result.repo.repository
    const repository = `${owner}/${name}`
    const kind = type === "pullrequests" ? "pull" : "issues"
    return {
      id: `${repository}#${result.number}`,
      title: plainTitleOf(result.hl_title),
      subtitle: `${repository}#${result.number}`,
      url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${kind}/${result.number}`,
      // 画面の検索の結果には更新時刻が無い。並びは検索式の更新順に任せ、時刻には作成時刻を使う
      updatedAt: DateTime.toEpochMillis(result.created),
    }
  }

export interface GitHubWebSearchPage {
  readonly isLoggedIn: boolean
  /** 検索式の並び（更新の新しい順）のまま。 */
  readonly items: ReadonlyArray<LiveItem>
}

/** 画面の検索の応答本文を読む。1 件でも形が合わなければ、応答全体を読めないものとして None。 */
export const parseGitHubWebSearch = (
  body: string,
  type: GitHubWebSearchType,
): Option.Option<GitHubWebSearchPage> =>
  Option.map(decodePage(body), ({ payload: { blackbirdSearchRoute: route } }) => ({
    isLoggedIn: route.logged_in,
    items: route.results.map(itemFrom(type)),
  }))

/** @param now - 上限に達したときの再開時刻を、待ち時間で知らされた場合の起点。 */
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
    // @me を使う検索式は、ログインしていないと結果が空になるだけで失敗にはならない
    onSome: (page) =>
      page.isLoggedIn ? Result.succeed(page.items) : Result.fail({ _tag: "NotSignedIn" }),
  })
}
