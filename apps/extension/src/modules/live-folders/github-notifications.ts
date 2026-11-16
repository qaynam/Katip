import { Array, DateTime, Option, pipe, Result, Schema } from "effect"
import type { HttpRequest, HttpResponse } from "#platform/http"
import { rateLimitRetryAt } from "./github-rate-limit"
import { contentOf, hasClass, plainTextOf, startTagsOf, type StartTag } from "./html-scan"
import type { LiveFetchFailure } from "./live-fetch-failure"
import { githubAvatarIcon, type LiveItem } from "./live-source"

const GITHUB_WEB = "https://github.com"

/** github.com's notifications inbox, showing only the unread notifications. */
export const GITHUB_UNREAD_NOTIFICATIONS_URL = `${GITHUB_WEB}/notifications?${new URLSearchParams({ query: "is:unread" })}`

/**
 * Reads the unread notifications from github.com's notifications page, with the signed-in
 * session's cookies.
 *
 * Reads the page rather than the official API so that it works without a token. The page's markup
 * isn't published and can change without notice, so a page that can't be read fails as unreadable,
 * making the breakage visible.
 */
export const GITHUB_NOTIFICATIONS_REQUEST: HttpRequest = {
  url: GITHUB_UNREAD_NOTIFICATIONS_URL,
  // Not JSON, as asked of the search page: the notifications page answers that with 406
  headers: { Accept: "text/html" },
  credentials: "include",
  // Not followed: signed out, the page redirects to the sign-in page, and the redirect tells that
  // without reading the sign-in page's markup
  redirect: "manual",
  // Not the browser's cache: a copy kept there would go on listing what has since been read
  cache: "no-store",
}

interface NotificationMarkup {
  readonly tag: StartTag
  readonly content: string
}

const notificationMarkupsOf = (html: string): ReadonlyArray<NotificationMarkup> => {
  const tags = startTagsOf(html, "li").filter((tag) => hasClass(tag, "notifications-list-item"))
  return tags.map((tag, index) => ({
    tag,
    // Not up to the end of the page when an item's end tag is missing: it would take what it lacks
    // from the items after it
    content: contentOf(html.slice(0, tags[index + 1]?.start ?? html.length), tag, "li"),
  }))
}

const firstWithClass = (html: string, name: string, className: string) =>
  Array.findFirst(startTagsOf(html, name), (tag) => hasClass(tag, className))

const nonBlank = (text: string | undefined): Option.Option<string> =>
  Option.liftPredicate(text?.trim() ?? "", (trimmed) => trimmed !== "")

const parseUrl = Option.liftThrowable((href: string) => new URL(href, GITHUB_WEB))

const linkOf = (content: string): Option.Option<URL> =>
  pipe(
    firstWithClass(content, "a", "notification-list-item-link"),
    Option.flatMap((link) => nonBlank(link.attributes.get("href"))),
    Option.flatMap(parseUrl),
    Option.filter((url) => url.origin === GITHUB_WEB),
  )

const titleOf = (content: string): Option.Option<string> =>
  pipe(
    firstWithClass(content, "p", "markdown-title"),
    Option.map((title) => plainTextOf(contentOf(content, title, "p")).replace(/\s+/g, " ")),
    Option.flatMap(nonBlank),
  )

const decodeTime = Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)

const updatedAtOf = (content: string): Option.Option<number> =>
  pipe(
    Array.head(startTagsOf(content, "relative-time")),
    Option.flatMap((time) => decodeTime(time.attributes.get("datetime"))),
    Option.map(DateTime.toEpochMillis),
  )

interface Repository {
  readonly owner: string
  /** `<owner>/<repo>`, followed by `#<number>` for an issue, a pull request or a discussion. */
  readonly subtitle: string
}

const repositoryPathPattern = /^\/([^/]+)\/([^/]+)(?:\/(?:issues|pull|discussions)\/(\d+))?/

const repositoryOf = (link: URL): Option.Option<Repository> =>
  Option.map(
    Option.fromNullishOr(link.pathname.match(repositoryPathPattern)),
    ([, owner = "", name = "", number]) => ({
      owner,
      subtitle: number === undefined ? `${owner}/${name}` : `${owner}/${name}#${number}`,
    }),
  )

const itemFrom = ({ tag, content }: NotificationMarkup): Option.Option<LiveItem> =>
  Option.map(
    Option.all({
      id: nonBlank(tag.attributes.get("data-notification-id")),
      link: linkOf(content),
      title: titleOf(content),
      // Not the time of the refresh in place of a missing one: the notification would count as
      // updated at every refresh, and come back unread after being read
      updatedAt: updatedAtOf(content),
    }),
    ({ id, link, title, updatedAt }) => {
      const repository = repositoryOf(link)
      return {
        id,
        title,
        subtitle: Option.match(repository, {
          onNone: () => "",
          onSome: ({ subtitle }) => subtitle,
        }),
        // Not the plain page of the issue or pull request: GitHub's own link carries the
        // notification, so that opening it marks the notification read, as the inbox does
        url: link.href,
        updatedAt,
        ...Option.match(repository, {
          onNone: () => ({}),
          onSome: ({ owner }) => ({ icon: githubAvatarIcon(owner) }),
        }),
      }
    },
  )

const isSignInPage = (html: string): boolean =>
  startTagsOf(html, "input").some(
    (input) => input.attributes.get("type")?.toLowerCase() === "password",
  )

// Not any page without notifications: one whose markup has changed would pass for an empty inbox,
// hiding the breakage
const isEmptyInbox = (html: string): boolean =>
  startTagsOf(html, "div").some((div) => hasClass(div, "blankslate"))

/**
 * Reads the unread notifications from the notifications page, in the page's order (most recently
 * updated first).
 *
 * Leaves out the notifications already read, and those without an id, a link on github.com or a
 * title or a time.
 *
 * Fails as not signed in for the sign-in page. Fails as unreadable for a page that is neither, or
 * that lists notifications none of which can be read.
 */
export const parseGitHubNotificationsPage = (
  html: string,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  const markups = notificationMarkupsOf(html)
  if (markups.length === 0) {
    if (isSignInPage(html)) return Result.fail({ _tag: "NotSignedIn" })
    return isEmptyInbox(html) ? Result.succeed([]) : Result.fail({ _tag: "UnreadableResponse" })
  }
  const notifications = markups.map((markup) => ({
    isUnread: hasClass(markup.tag, "notification-unread"),
    item: itemFrom(markup),
  }))
  if (notifications.every(({ item }) => Option.isNone(item))) {
    return Result.fail({ _tag: "UnreadableResponse" })
  }
  return Result.succeed(
    Array.getSomes(notifications.filter(({ isUnread }) => isUnread).map(({ item }) => item)),
  )
}

/** @param now - What the retry time counts from when the rate limit gives it as a wait. */
export const githubNotificationItemsFrom = (
  response: HttpResponse,
  now: number,
): Result.Result<ReadonlyArray<LiveItem>, LiveFetchFailure> => {
  if (response.isRedirect || response.status === 401) return Result.fail({ _tag: "NotSignedIn" })
  const retryAt = rateLimitRetryAt(response, now)
  if (Option.isSome(retryAt)) return Result.fail({ _tag: "RateLimited", retryAt: retryAt.value })
  if (response.status === 403) return Result.fail({ _tag: "AccessDenied", status: 403 })
  if (response.status !== 200) {
    return Result.fail({ _tag: "UnexpectedStatus", status: response.status })
  }
  return parseGitHubNotificationsPage(response.body)
}
