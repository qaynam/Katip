import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Option, type Layer, type Scope } from "effect"
import type { LiveSource } from "#modules/live-folders"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse } from "#platform/http"
import { FakeNotifications } from "#platform/notifications"
import { FakePermissions } from "#platform/permissions"
import type { PinnedLiveFolderView, SidebarView } from "#protocol"
import {
  backgroundTestLayer,
  eventually,
  openSidebar,
  spaceNamed,
  startBackground,
} from "./testing/background-harness"

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof backgroundTestLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(backgroundTestLayer))

const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }
const reviewRequests: LiveSource = { _tag: "GitHub", query: "review-requested" }

interface Mail {
  readonly id: string
  readonly subject: string
  readonly isImportant?: boolean
}

const gmailEntry = ({ id, subject }: Mail) =>
  `<entry><title>${subject}</title><summary>Start of the message</summary><link rel="alternate" href="https://mail.google.com/mail?account_id=taro.yamada@example.com&amp;message_id=${id}&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><issued>2026-10-30T09:10:01Z</issued><id>tag:gmail.google.com,2004:${id}</id><author><name>Hanako Sato</name><email>hanako.sato@example.co.jp</email></author></entry>`

const gmailFeed = (mails: ReadonlyArray<Mail>) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@example.com</title><fullcount>${mails.length}</fullcount><modified>2026-10-30T09:12:44Z</modified>${mails.map(gmailEntry).join("")}</feed>`

/** Serves the unread mail, newest first, and among them the important ones in their own feed. */
const serveInbox = (...mails: ReadonlyArray<Mail>) =>
  FakeHttp.use((http) =>
    Effect.andThen(
      http.route("https://mail.google.com/mail/u/0/feed/atom", () =>
        Effect.succeed(httpResponse(200, gmailFeed(mails))),
      ),
      http.route("https://mail.google.com/mail/u/0/feed/atom/%5Eio_im", () =>
        Effect.succeed(httpResponse(200, gmailFeed(mails.filter((mail) => mail.isImportant)))),
      ),
    ),
  )

/** Serves review requests, newest first, by pull request number and title. */
const serveReviewRequests = (...pulls: ReadonlyArray<readonly [number, string]>) =>
  FakeHttp.use((http) =>
    http.route("https://github.com/search", () =>
      Effect.succeed(
        httpResponse(
          200,
          JSON.stringify({
            payload: {
              blackbirdSearchRoute: {
                logged_in: true,
                result_count: pulls.length,
                page: 1,
                page_count: 1,
                results: pulls.map(([number, title]) => ({
                  id: String(number),
                  hl_title: title,
                  hl_text: "",
                  number,
                  state: "open",
                  merged: false,
                  created: "2026-10-29T03:00:00.000Z",
                  num_comments: 0,
                  author_name: "hanako",
                  repo: { repository: { id: 1, name: "katip", owner_login: "katip-dev" } },
                  issue: { issue: { pull_request_id: number } },
                  labels: [],
                })),
              },
            },
          }),
        ),
      ),
    ),
  )

const allowAccessTo = (origin: string) =>
  FakePermissions.use((permissions) => permissions.grant([origin]))

const allowNotifications = FakePermissions.use((permissions) =>
  permissions.grantPermissions(["notifications"]),
)

const liveFolderOf = (view: SidebarView): Option.Option<PinnedLiveFolderView> =>
  Option.flatMap(spaceNamed(view, "Home"), (space) =>
    space.pinned._tag === "Available"
      ? Array.findFirst(space.pinned.nodes, (node) =>
          node._tag === "PinnedLiveFolder" ? Option.some(node) : Option.none(),
        )
      : Option.none(),
  )

const itemTitlesOf = (view: SidebarView): ReadonlyArray<string> =>
  Option.match(liveFolderOf(view), {
    onNone: () => [],
    onSome: (live) => live.items.map((item) => item.title),
  })

const shownNotifications = FakeNotifications.use((fake) => fake.shown)

/** Waits until a notification is shown, and returns what every shown one says. */
const notificationsOnceShown = Effect.map(
  eventually(
    Effect.map(
      shownNotifications,
      Option.liftPredicate((all) => all.length > 0),
    ),
  ),
  (all) => all.map(({ title, message, contextMessage }) => ({ title, message, contextMessage })),
)

/**
 * Starts with a side panel and a live folder fetching from `source`, and waits for its first fetch.
 * Returns a way to refresh the folder that waits until the side panel lists `title`.
 */
const startWithLiveFolder = (source: LiveSource) =>
  Effect.gen(function* () {
    const fake = yield* FakeBrowser
    const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
    yield* startBackground
    const sidebar = yield* openSidebar(windowId)
    const initial = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
    yield* sidebar.run({
      _tag: "CreateLiveFolder",
      spaceId: initial.activeSpaceId,
      parentId: null,
      source,
    })
    const ready = yield* sidebar.viewWhere((v) =>
      Option.exists(liveFolderOf(v), (live) => live.status._tag === "Ready"),
    )
    const folder = Option.getOrThrow(liveFolderOf(ready))
    const refreshUntilListed = (title: string) =>
      Effect.andThen(
        sidebar.run({ _tag: "RefreshLiveFolder", bookmarkId: folder.bookmarkId }),
        sidebar.viewWhere((v) => itemTitlesOf(v).includes(title)),
      )
    return { windowId, sidebar, refreshUntilListed }
  })

describe("notifying about new items in live folders", () => {
  it.live(
    "a new mail Gmail marks important is shown as a notification with its subject, its sender and the folder's name",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* allowNotifications
          yield* allowAccessTo("https://mail.google.com/*")
          yield* serveInbox({ id: "1", subject: "Invoice attached" })
          const { refreshUntilListed } = yield* startWithLiveFolder(inbox)

          yield* serveInbox(
            { id: "2", subject: "Contract to sign", isImportant: true },
            { id: "1", subject: "Invoice attached" },
          )
          yield* refreshUntilListed("Contract to sign")

          expect(yield* notificationsOnceShown).toStrictEqual([
            { title: "Contract to sign", message: "Hanako Sato", contextMessage: "Gmail Inbox" },
          ])
        }),
      ),
  )

  it.live("a new mail Gmail doesn't mark important shows no notification", () =>
    inBackground(
      Effect.gen(function* () {
        yield* allowNotifications
        yield* allowAccessTo("https://mail.google.com/*")
        yield* serveInbox({ id: "1", subject: "Invoice attached" })
        const { refreshUntilListed } = yield* startWithLiveFolder(inbox)

        yield* serveInbox(
          { id: "2", subject: "Weekly newsletter" },
          { id: "1", subject: "Invoice attached" },
        )
        yield* refreshUntilListed("Weekly newsletter")
        yield* serveInbox(
          { id: "3", subject: "Contract to sign", isImportant: true },
          { id: "2", subject: "Weekly newsletter" },
          { id: "1", subject: "Invoice attached" },
        )
        yield* refreshUntilListed("Contract to sign")

        expect((yield* notificationsOnceShown).map(({ title }) => title)).toStrictEqual([
          "Contract to sign",
        ])
      }),
    ),
  )

  it.live("several important mails arriving together share one notification that counts them", () =>
    inBackground(
      Effect.gen(function* () {
        yield* allowNotifications
        yield* allowAccessTo("https://mail.google.com/*")
        yield* serveInbox({ id: "1", subject: "Invoice attached" })
        const { refreshUntilListed } = yield* startWithLiveFolder(inbox)

        yield* serveInbox(
          { id: "3", subject: "Contract to sign", isImportant: true },
          { id: "2", subject: "Flight changed", isImportant: true },
          { id: "1", subject: "Invoice attached" },
        )
        yield* refreshUntilListed("Contract to sign")

        expect(yield* notificationsOnceShown).toStrictEqual([
          {
            title: "2 new important emails",
            message: "Contract to sign\nFlight changed",
            contextMessage: "Gmail Inbox",
          },
        ])
      }),
    ),
  )

  it.live("a new item in a GitHub live folder is shown as a notification", () =>
    inBackground(
      Effect.gen(function* () {
        yield* allowNotifications
        yield* allowAccessTo("https://github.com/*")
        yield* serveReviewRequests([200, "Add live folders"])
        const { refreshUntilListed } = yield* startWithLiveFolder(reviewRequests)

        yield* serveReviewRequests([201, "Fix the sync"], [200, "Add live folders"])
        yield* refreshUntilListed("Fix the sync")

        expect(yield* notificationsOnceShown).toStrictEqual([
          {
            title: "Fix the sync",
            message: "katip-dev/katip#201",
            contextMessage: "GitHub Review Requests",
          },
        ])
      }),
    ),
  )

  it.live("the items a live folder starts with are not announced", () =>
    inBackground(
      Effect.gen(function* () {
        yield* allowNotifications
        yield* allowAccessTo("https://mail.google.com/*")
        yield* serveInbox({ id: "1", subject: "Invoice attached", isImportant: true })
        const { refreshUntilListed } = yield* startWithLiveFolder(inbox)

        yield* serveInbox(
          { id: "2", subject: "Contract to sign", isImportant: true },
          { id: "1", subject: "Invoice attached", isImportant: true },
        )
        yield* refreshUntilListed("Contract to sign")

        expect((yield* notificationsOnceShown).map(({ title }) => title)).toStrictEqual([
          "Contract to sign",
        ])
      }),
    ),
  )

  it.live("without the notifications permission, new items show no notification", () =>
    inBackground(
      Effect.gen(function* () {
        yield* allowAccessTo("https://mail.google.com/*")
        yield* serveInbox({ id: "1", subject: "Invoice attached" })
        const { refreshUntilListed } = yield* startWithLiveFolder(inbox)

        yield* serveInbox(
          { id: "2", subject: "Contract to sign", isImportant: true },
          { id: "1", subject: "Invoice attached" },
        )
        yield* refreshUntilListed("Contract to sign")
        yield* allowNotifications
        yield* serveInbox(
          { id: "3", subject: "Flight changed", isImportant: true },
          { id: "2", subject: "Contract to sign", isImportant: true },
          { id: "1", subject: "Invoice attached" },
        )
        yield* refreshUntilListed("Flight changed")

        expect((yield* notificationsOnceShown).map(({ title }) => title)).toStrictEqual([
          "Flight changed",
        ])
      }),
    ),
  )
})

describe("clicking a notification about a live item", () => {
  const startWithNotifiedMail = Effect.gen(function* () {
    yield* allowNotifications
    yield* allowAccessTo("https://mail.google.com/*")
    yield* serveInbox({ id: "1", subject: "Invoice attached" })
    const started = yield* startWithLiveFolder(inbox)
    yield* serveInbox(
      { id: "2", subject: "Contract to sign", isImportant: true },
      { id: "1", subject: "Invoice attached" },
    )
    const view = yield* started.refreshUntilListed("Contract to sign")
    yield* notificationsOnceShown
    const [notification] = yield* shownNotifications
    const item = Option.flatMap(liveFolderOf(view), (live) =>
      Array.findFirst(live.items, (each) => each.title === "Contract to sign"),
    )
    return {
      ...started,
      notificationId: notification?.id ?? "",
      url: Option.getOrThrow(item).url,
    }
  })

  const click = (notificationId: string) =>
    FakeBrowser.use((fake) => fake.emit({ _tag: "NotificationClicked", notificationId }))

  const tabUrls = FakeBrowser.use((fake) =>
    Effect.map(fake.snapshot, ({ tabs }) =>
      tabs.flatMap((tab) => (Option.isSome(tab.url) ? [tab.url.value] : [])),
    ),
  )

  const tabOpenedAt = (url: string) =>
    eventually(
      Effect.map(tabUrls, (urls) => (urls.includes(url) ? Option.some(url) : Option.none())),
    )

  it.live(
    "opens the item and marks it read, as clicking it in the side panel does, and clears the notification",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { sidebar, notificationId, url } = yield* startWithNotifiedMail

          yield* click(notificationId)
          yield* tabOpenedAt(url)
          const view = yield* sidebar.viewWhere((v) =>
            Option.exists(liveFolderOf(v), (live) =>
              live.items.some((item) => item.url === url && !item.isUnseen),
            ),
          )

          expect({
            unread: Option.map(liveFolderOf(view), (live) =>
              live.items.map((item) => [item.title, item.isUnseen]),
            ),
            shown: yield* shownNotifications,
          }).toStrictEqual({
            unread: Option.some([
              ["Contract to sign", false],
              ["Invoice attached", true],
            ]),
            shown: [],
          })
        }),
      ),
  )

  it.live("opens the item's page all the same once the item has left its folder", () =>
    inBackground(
      Effect.gen(function* () {
        const { refreshUntilListed, notificationId, url } = yield* startWithNotifiedMail
        yield* serveInbox({ id: "3", subject: "Flight changed" })
        yield* refreshUntilListed("Flight changed")

        yield* click(notificationId)

        expect(yield* tabOpenedAt(url)).toBe(url)
      }),
    ),
  )
})
