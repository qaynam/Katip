import { Array, DateTime, Option, pipe, Record, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import { githubApiRequest } from "./github-api-search"
import { rateLimitRetryAt } from "./github-rate-limit"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { githubAvatarIcon, type LiveItem } from "./live-source"

/** The notifications inbox on github.com, opened for a thread whose own page can't be told. */
export const GITHUB_NOTIFICATIONS_PAGE_URL = "https://github.com/notifications"

/** Asks the official API for the unread threads of the notifications inbox. */
export const githubNotificationsRequest = (token: string): HttpRequest =>
  githubApiRequest(
    `https://api.github.com/notifications?${new URLSearchParams({ all: "false", per_page: "50" })}`,
    token,
  )

const NotificationsResponse = Schema.fromJsonString(Schema.Array(Schema.Unknown))

const Thread = Schema.Struct({
  id: Schema.String,
  updated_at: Schema.DateTimeUtcFromString,
  subject: Schema.Struct({ title: Schema.String, url: Schema.NullOr(Schema.String) }),
  repository: Schema.Struct({
    full_name: Schema.String,
    owner: Schema.Struct({ login: Schema.String }),
  }),
})
type Thread = typeof Thread.Type

const decodeResponse = Schema.decodeUnknownOption(NotificationsResponse)
const decodeThread = Schema.decodeUnknownOption(Thread)

interface SubjectPage {
  readonly url: string
  /** The issue or pull request number. */
  readonly number: Option.Option<string>
}

type SubjectPageOf = (repositoryPage: string, id: string) => SubjectPage

const subjectPages: Record.ReadonlyRecord<string, SubjectPageOf> = {
  issues: (repositoryPage, id) => ({
    url: `${repositoryPage}/issues/${id}`,
    number: Option.some(id),
  }),
  pulls: (repositoryPage, id) => ({ url: `${repositoryPage}/pull/${id}`, number: Option.some(id) }),
  commits: (repositoryPage, id) => ({
    url: `${repositoryPage}/commit/${id}`,
    number: Option.none(),
  }),
  // Not the release's own page: the API names a release by its id, and its page by its tag
  releases: (repositoryPage) => ({ url: `${repositoryPage}/releases`, number: Option.none() }),
}

const subjectUrlPattern =
  /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)\/(issues|pulls|commits|releases)\/(\w+)$/

const subjectPageOf = (subjectUrl: string | null): SubjectPage =>
  pipe(
    Option.fromNullishOr(subjectUrl?.match(subjectUrlPattern)),
    Option.flatMap(([, repository = "", kind = "", id = ""]) =>
      Option.map(Record.get(subjectPages, kind), (pageOf) =>
        pageOf(`https://github.com/${repository}`, id),
      ),
    ),
    Option.getOrElse((): SubjectPage => ({
      url: GITHUB_NOTIFICATIONS_PAGE_URL,
      number: Option.none(),
    })),
  )

const itemFrom = (thread: Thread): LiveItem => {
  const page = subjectPageOf(thread.subject.url)
  const repository = thread.repository.full_name
  return {
    id: thread.id,
    title: thread.subject.title,
    subtitle: Option.match(page.number, {
      onNone: () => repository,
      onSome: (number) => `${repository}#${number}`,
    }),
    url: page.url,
    updatedAt: DateTime.toEpochMillis(thread.updated_at),
    icon: githubAvatarIcon(thread.repository.owner.login),
  }
}

/**
 * Reads the threads, in the API's order (most recently updated first), from a notifications
 * response body. Each opens the page of its issue, pull request, commit or release, and any other
 * kind opens the notifications inbox. Leaves out threads of the wrong shape. None if the response
 * is unreadable.
 */
export const parseGitHubNotifications = (body: string): Option.Option<ReadonlyArray<LiveItem>> =>
  Option.map(decodeResponse(body), (threads) =>
    Array.getSomes(threads.map((raw) => Option.map(decodeThread(raw), itemFrom))),
  )

/** @param now - What the retry time counts from when the rate limit gives it as a wait. */
export const githubNotificationItemsFrom = (
  response: HttpResponse,
  now: number,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.status === 200) {
    return Result.fromOption(parseGitHubNotifications(response.body), () => ({
      _tag: "UnreadableResponse" as const,
    }))
  }
  if (response.status === 401) return Result.fail({ _tag: "TokenRejected" })
  const retryAt = rateLimitRetryAt(response, now)
  if (Option.isSome(retryAt)) return Result.fail({ _tag: "RateLimited", retryAt: retryAt.value })
  // Not taken as a missing page: the inbox always exists, and GitHub answers 404 rather than 403
  // for what a token isn't allowed to see
  if (response.status === 403 || response.status === 404) {
    return Result.fail({ _tag: "TokenCannotReadNotifications" })
  }
  return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
}
