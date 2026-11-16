import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { httpResponse, redirectResponse } from "#platform/http"
import {
  GITHUB_NOTIFICATIONS_REQUEST,
  githubNotificationItemsFrom,
  parseGitHubNotificationsPage,
} from "./github-notifications"
import type { LiveItem } from "./live-source"

const NOW = Date.UTC(2026, 10, 16, 9, 0, 0)

interface Notification {
  readonly id?: string
  readonly isUnread?: boolean
  readonly href?: string
  readonly repository?: string
  /** What the page shows after the repository, such as the number. */
  readonly label?: string
  readonly octicon?: string
  /** Markup, as GitHub renders the title. */
  readonly title?: string
  /** Null leaves the time out. */
  readonly updatedAt?: string | null
  readonly reason?: string
}

const relativeTime = (datetime: string) =>
  `<relative-time class="no-wrap" datetime="${datetime}" title="Nov 16, 2026, 5:41 PM GMT+9">Nov 16</relative-time>`

const notification = ({
  id = "NT_kwDOKatipDev0000000042",
  isUnread = true,
  href = `/katip-dev/katip/pull/42?notification_referrer_id=${id}`,
  repository = "katip-dev/katip",
  label = "#42",
  octicon = "octicon-git-pull-request color-fg-open",
  title = "Add a notifications live folder",
  updatedAt = "2026-11-16T08:41:12Z",
  reason = "review requested",
}: Notification = {}) => `
  <li class="Box-row Box-row--hover-gray p-0 notifications-list-item d-flex js-notifications-list-item js-navigation-item ${isUnread ? "notification-unread" : "notification-read"} color-bg-default" data-notification-id="${id}">
    <div class="d-flex flex-items-baseline flex-auto">
      <label class="flex-shrink-0 py-2 pl-3 pr-2">
        <input type="checkbox" name="notification_ids[]" value="${id}" class="js-notification-bulk-action-check-item" aria-label="Select notification">
      </label>
      <span class="flex-shrink-0 mr-2"><svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon ${octicon}"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0Z"></path></svg></span>
      <a class="d-flex flex-1 flex-items-baseline no-underline js-navigation-open notification-list-item-link pr-1" href="${href}" data-hydro-click="{&quot;event_type&quot;:&quot;notifications.click&quot;,&quot;payload&quot;:{&quot;position&quot;:1}}">
        <div class="d-flex flex-column flex-auto">
          <p class="m-0 f6 flex-auto">
            ${repository}
            <span class="text-normal color-fg-muted">${label}</span>
          </p>
          <p class="m-0 text-normal pr-2 pr-md-0 markdown-title">
            ${title}
          </p>
        </div>
      </a>
      <div class="AvatarStack AvatarStack--right flex-shrink-0 ml-2">
        <div class="AvatarStack-body">
          <a class="avatar avatar-user" href="/hanako-sato"><img class="avatar-user" src="https://avatars.githubusercontent.com/u/1029384?s=40&amp;v=4" alt="@hanako-sato" width="20" height="20"></a>
        </div>
      </div>
      <span class="f6 flex-self-center ml-2 pl-2 color-fg-muted">${reason}</span>
      ${updatedAt === null ? "" : `<span class="d-md-none">${relativeTime(updatedAt)}</span><span class="d-none d-md-block">${relativeTime(updatedAt)}</span>`}
      <ul class="notification-list-item-actions d-flex list-style-none">
        <li><form action="/notifications/beta/archive" accept-charset="UTF-8" method="post"><input type="hidden" name="notification_ids[]" value="${id}"><button type="submit" class="btn btn-sm" aria-label="Done">Done</button></form></li>
        <li><form action="/notifications/beta/unsubscribe" accept-charset="UTF-8" method="post"><input type="hidden" name="notification_ids[]" value="${id}"><button type="submit" class="btn btn-sm" aria-label="Unsubscribe">Unsubscribe</button></form></li>
        <li><form action="/notifications/beta/star" accept-charset="UTF-8" method="post"><input type="hidden" name="notification_ids[]" value="${id}"><button type="submit" class="btn btn-sm" aria-label="Save">Save</button></form></li>
      </ul>
    </div>
  </li>`

const notificationsPage = (...notifications: ReadonlyArray<string>) => `<!DOCTYPE html>
<html lang="en" data-color-mode="auto">
  <head><meta charset="utf-8"><title>Notifications</title></head>
  <body class="logged-in env-production page-responsive">
    <div class="d-flex flex-column flex-md-row">
      <nav class="notifications-sidebar" aria-label="Notifications">
        <a href="/notifications" aria-current="page">Inbox</a>
        <a href="/notifications?query=is%3Asaved">Saved</a>
      </nav>
      <div class="js-notifications-container flex-auto">
        <ul class="list-style-none js-notifications-list">${notifications.join("")}
        </ul>
      </div>
    </div>
    <footer class="footer"><p class="f6 color-fg-muted">© 2026 GitHub, Inc.</p></footer>
  </body>
</html>`

const emptyInboxPage = `<!DOCTYPE html>
<html lang="en">
  <head><title>Notifications</title></head>
  <body class="logged-in env-production page-responsive">
    <div class="js-notifications-container flex-auto">
      <div class="blankslate blankslate-spacious">
        <h3 class="blankslate-heading">All caught up!</h3>
        <p>Take a break, write some code, do what you do best.</p>
      </div>
    </div>
  </body>
</html>`

const signInPage = `<!DOCTYPE html>
<html lang="en">
  <head><title>Sign in to GitHub · GitHub</title></head>
  <body class="logged-out session-authentication">
    <div class="auth-form px-3" id="login">
      <form action="/session" accept-charset="UTF-8" method="post">
        <label for="login_field">Username or email address</label>
        <input type="text" name="login" id="login_field" class="form-control" autocomplete="username">
        <label for="password">Password</label>
        <input type="password" name="password" id="password" class="form-control" autocomplete="current-password">
        <input type="submit" name="commit" value="Sign in" class="btn btn-primary btn-block">
      </form>
    </div>
  </body>
</html>`

const appShellPage = `<!DOCTYPE html>
<html lang="en">
  <head><title>Notifications</title></head>
  <body class="logged-in env-production page-responsive">
    <react-app app-name="notifications">
      <script type="application/json" data-target="react-app.embeddedData">{"payload":{"header":{"login":"hanako-sato"}}}</script>
      <div data-target="react-app.reactRoot"></div>
    </react-app>
  </body>
</html>`

const itemsOf = (html: string) => parseGitHubNotificationsPage(html, NOW)

const fieldOf = <K extends keyof LiveItem>(html: string, key: K) =>
  Result.map(itemsOf(html), (items) => items.map((item) => item[key]))

describe("the request for the notifications page", () => {
  const request = GITHUB_NOTIFICATIONS_REQUEST

  it("asks github.com's notifications page for the unread notifications, as a page", () => {
    const url = new URL(request.url)

    expect([
      url.origin + url.pathname,
      url.searchParams.get("query"),
      request.headers?.["Accept"],
    ]).toStrictEqual(["https://github.com/notifications", "is:unread", "text/html"])
  })

  it("sends the signed-in session's cookies rather than a token", () => {
    expect([request.credentials, request.headers?.["Authorization"]]).toStrictEqual([
      "include",
      undefined,
    ])
  })

  it("doesn't follow a redirect to the sign-in page", () => {
    expect(request.redirect).toBe("manual")
  })

  it("never answers from the browser's cache, which would keep what has since been read", () => {
    expect(request.cache).toBe("no-store")
  })
})

describe("reading the notifications page", () => {
  it("turns a notification into an item titled after it, with the repository and number as the subtitle and the owner's avatar as the icon", () => {
    expect(itemsOf(notificationsPage(notification()))).toStrictEqual(
      Result.succeed([
        {
          id: "NT_kwDOKatipDev0000000042",
          title: "Add a notifications live folder",
          subtitle: "katip-dev/katip#42",
          url: "https://github.com/katip-dev/katip/pull/42?notification_referrer_id=NT_kwDOKatipDev0000000042",
          updatedAt: Date.UTC(2026, 10, 16, 8, 41, 12),
          icon: { _tag: "Image", url: "https://github.com/katip-dev.png?size=40" },
        },
      ]),
    )
  })

  it("opens a notification through GitHub's own link, which marks it read as the inbox does", () => {
    const page = notificationsPage(
      notification({
        id: "NT_kwDOKatipDev0000000007",
        href: "/katip-dev/katip/issues/7?notification_referrer_id=NT_kwDOKatipDev0000000007",
      }),
    )

    expect(
      Result.map(fieldOf(page, "url"), (urls) =>
        urls.map((url) => new URL(url).searchParams.get("notification_referrer_id")),
      ),
    ).toStrictEqual(Result.succeed(["NT_kwDOKatipDev0000000007"]))
  })

  it("gives the number of an issue or a pull request, and only the repository for a notification without one, such as a workflow run", () => {
    const page = notificationsPage(
      notification({
        id: "issue",
        href: "/katip-dev/katip/issues/7?notification_referrer_id=issue",
        label: "#7",
        octicon: "octicon-issue-opened color-fg-open",
      }),
      notification({ id: "pull-request" }),
      notification({
        id: "workflow-run",
        href: "/katip-dev/katip/actions/runs/19283746501?notification_referrer_id=workflow-run",
        label: "CI",
        octicon: "octicon-x color-fg-danger",
        title: "CI workflow run failed for main branch",
        reason: "ci activity",
      }),
    )

    expect(fieldOf(page, "subtitle")).toStrictEqual(
      Result.succeed(["katip-dev/katip#7", "katip-dev/katip#42", "katip-dev/katip"]),
    )
  })

  it("strips inline markup from the title, joins its lines and decodes character references", () => {
    const page = notificationsPage(
      notification({
        title:
          'Fix <code class="notranslate">&lt;Button&gt;</code> focus &amp; blur\n            &#x2014; &quot;a11y&#39;s&quot; pass',
      }),
    )

    expect(fieldOf(page, "title")).toStrictEqual(
      Result.succeed(['Fix <Button> focus & blur — "a11y\'s" pass']),
    )
  })

  it("takes the time a notification was last updated from the page, and counts one without a time as updated now", () => {
    const page = notificationsPage(
      notification({ id: "timed", updatedAt: "2026-11-15T23:05:00Z" }),
      notification({ id: "untimed", updatedAt: null }),
    )

    expect(fieldOf(page, "updatedAt")).toStrictEqual(
      Result.succeed([Date.UTC(2026, 10, 15, 23, 5, 0), NOW]),
    )
  })

  it("keeps the page's order, most recently updated first", () => {
    const page = notificationsPage(
      notification({ id: "newer", updatedAt: "2026-11-16T08:00:00Z" }),
      notification({ id: "older", updatedAt: "2026-11-01T08:00:00Z" }),
    )

    expect(fieldOf(page, "id")).toStrictEqual(Result.succeed(["newer", "older"]))
  })

  it("leaves out the notifications already read", () => {
    const page = notificationsPage(
      notification({ id: "read", isUnread: false }),
      notification({ id: "unread" }),
    )

    expect(fieldOf(page, "id")).toStrictEqual(Result.succeed(["unread"]))
  })

  it("leaves out only the notifications without an id, a link on github.com or a title, keeping the others", () => {
    const page = notificationsPage(
      notification({ id: "" }),
      notification({ id: "no-link", href: "" }),
      notification({ id: "elsewhere", href: "https://github.example/katip-dev/katip/pull/42" }),
      notification({ id: "script", href: "javascript:alert(1)" }),
      notification({ id: "untitled", title: "<code></code>" }),
      notification({ id: "kept" }),
    )

    expect(fieldOf(page, "id")).toStrictEqual(Result.succeed(["kept"]))
  })

  it("reads a notification whatever order and quotes its attributes come in, with > or character references in their values", () => {
    const page = notificationsPage(`
      <li data-notification-id='NT_kwDOKatipDev0000000009' class='notification-unread notifications-list-item'>
        <a aria-label="Open > Issue" href='/katip-dev/katip/issues/9?notification_referrer_id=NT_kwDOKatipDev0000000009&amp;source=inbox' class='notification-list-item-link'>
          <p class=markdown-title>Reordered attributes</p>
        </a>
        <relative-time datetime='2026-11-16T07:00:00Z' class='no-wrap'></relative-time>
      </li>`)

    expect(itemsOf(page)).toStrictEqual(
      Result.succeed([
        {
          id: "NT_kwDOKatipDev0000000009",
          title: "Reordered attributes",
          subtitle: "katip-dev/katip#9",
          url: "https://github.com/katip-dev/katip/issues/9?notification_referrer_id=NT_kwDOKatipDev0000000009&source=inbox",
          updatedAt: Date.UTC(2026, 10, 16, 7, 0, 0),
          icon: { _tag: "Image", url: "https://github.com/katip-dev.png?size=40" },
        },
      ]),
    )
  })

  it("doesn't take what a notification lacks from the one after it, even when its end tag is missing", () => {
    const page = notificationsPage(
      `
      <li class="notifications-list-item notification-unread" data-notification-id="unclosed">
        <a class="notification-list-item-link" href="/katip-dev/katip/issues/1?notification_referrer_id=unclosed"></a>`,
      notification({ id: "closed" }),
    )

    expect(fieldOf(page, "id")).toStrictEqual(Result.succeed(["closed"]))
  })

  it("is empty when nothing is unread", () => {
    expect(itemsOf(emptyInboxPage)).toStrictEqual(Result.succeed([]))
  })

  it("takes the sign-in page as not signed in", () => {
    expect(itemsOf(signInPage)).toStrictEqual(Result.fail({ _tag: "NotSignedIn" }))
  })

  it("can't read a page that is neither the notifications page nor the sign-in page", () => {
    expect([itemsOf(appShellPage), itemsOf("")]).toStrictEqual([
      Result.fail({ _tag: "UnreadableResponse" }),
      Result.fail({ _tag: "UnreadableResponse" }),
    ])
  })

  it("can't read a page that lists notifications none of which can be read", () => {
    const page = notificationsPage(notification({ title: "" }), notification({ href: "" }))

    expect(itemsOf(page)).toStrictEqual(Result.fail({ _tag: "UnreadableResponse" }))
  })
})

describe("judging responses for the notifications page", () => {
  it("takes in the unread notifications on success", () => {
    const result = githubNotificationItemsFrom(
      httpResponse(200, notificationsPage(notification())),
      NOW,
    )

    expect(Result.map(result, (items) => items.length)).toStrictEqual(Result.succeed(1))
  })

  it("a redirect or a request for authentication means not signed in", () => {
    expect([
      githubNotificationItemsFrom(redirectResponse, NOW),
      githubNotificationItemsFrom(httpResponse(401), NOW),
    ]).toStrictEqual([Result.fail({ _tag: "NotSignedIn" }), Result.fail({ _tag: "NotSignedIn" })])
  })

  it("when refused for sending too much, waits the seconds given", () => {
    const response = httpResponse(429, "Too many requests", { "retry-after": "30" })

    expect(githubNotificationItemsFrom(response, NOW)).toStrictEqual(
      Result.fail({ _tag: "RateLimited", retryAt: NOW + 30_000 }),
    )
  })

  it("a refusal means access is denied", () => {
    expect(githubNotificationItemsFrom(httpResponse(403), NOW)).toStrictEqual(
      Result.fail({ _tag: "AccessDenied", status: 403 }),
    )
  })

  it("any other error response fails with its status code", () => {
    expect(githubNotificationItemsFrom(httpResponse(500), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnexpectedStatus", status: 500 }),
    )
  })

  it("a successful response that isn't a page it can read is unreadable", () => {
    expect(githubNotificationItemsFrom(httpResponse(200, "{}"), NOW)).toStrictEqual(
      Result.fail({ _tag: "UnreadableResponse" }),
    )
  })
})
