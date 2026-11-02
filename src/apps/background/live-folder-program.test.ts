import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Option, type Scope, type Layer } from "effect"
import type { LiveSource } from "#modules/live-folders"
import { Alarms, BookmarkId, Storage, type BookmarkNode, type WindowId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse, redirectResponse } from "#platform/http"
import { FakePermissions } from "#platform/permissions"
import type { PinnedLiveFolderView, PinnedNodeView, SidebarView } from "#protocol"
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

const GMAIL_ORIGIN = "https://mail.google.com/*"
const GITHUB_ORIGIN = "https://github.com/*"
const GITHUB_API_ORIGIN = "https://api.github.com/*"
const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }
const reviewRequests: LiveSource = { _tag: "GitHub", query: "review-requested" }

const gmailEntry = (id: string, subject: string) =>
  `<entry><title>${subject}</title><summary>Start of the message</summary><link rel="alternate" href="https://mail.google.com/mail?account_id=taro.yamada@example.com&amp;message_id=${id}&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><issued>2026-10-30T09:10:01Z</issued><id>tag:gmail.google.com,2004:${id}</id><author><name>Hanako Sato</name><email>hanako.sato@example.co.jp</email></author></entry>`

const gmailFeed = (...entries: ReadonlyArray<string>) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@example.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>${entries.length}</fullcount><link rel="alternate" href="https://mail.google.com/mail" type="text/html" /><modified>2026-10-30T09:12:44Z</modified>${entries.join("")}</feed>`

const githubSearchBody = (...titles: ReadonlyArray<string>) =>
  JSON.stringify({
    total_count: titles.length,
    incomplete_results: false,
    items: titles.map((title, index) => ({
      id: 9000 + index,
      number: 100 + index,
      title,
      html_url: `https://github.com/katip-dev/katip/pull/${100 + index}`,
      repository_url: "https://api.github.com/repos/katip-dev/katip",
      updated_at: "2026-10-30T08:55:41Z",
      pull_request: { url: "https://api.github.com/repos/katip-dev/katip/pulls/1" },
    })),
  })

const githubWebPage = (titles: ReadonlyArray<string>, { loggedIn = true } = {}) =>
  JSON.stringify({
    meta: { title: "Pull request search results" },
    payload: {
      blackbirdSearchRoute: {
        logged_in: loggedIn,
        result_count: titles.length,
        page: 1,
        page_count: 1,
        results: titles.map((title, index) => ({
          id: String(5000 + index),
          hl_title: title,
          hl_text: "",
          number: 200 + index,
          state: "open",
          merged: false,
          created: "2026-10-29T03:00:00.000Z",
          num_comments: 0,
          author_name: "hanako",
          repo: { repository: { id: 1, name: "katip", owner_login: "katip-dev" } },
          issue: { issue: { pull_request_id: 1 } },
          labels: [],
        })),
      },
    },
  })

const serveGitHubWeb = (body: string) =>
  FakeHttp.use((http) =>
    http.route("https://github.com/search", () => Effect.succeed(httpResponse(200, body))),
  )

const serveGmail = (xml: string) =>
  FakeHttp.use((http) =>
    http.route("https://mail.google.com/", () => Effect.succeed(httpResponse(200, xml))),
  )

const grant = (origin: string) => FakePermissions.use((permissions) => permissions.grant([origin]))

const homeNodes = (view: SidebarView): ReadonlyArray<PinnedNodeView> =>
  Option.match(spaceNamed(view, "Home"), {
    onNone: () => [],
    onSome: (space) => (space.pinned._tag === "Available" ? space.pinned.nodes : []),
  })

const liveFolderOf = (view: SidebarView): Option.Option<PinnedLiveFolderView> =>
  Array.findFirst(homeNodes(view), (node) =>
    node._tag === "PinnedLiveFolder" ? Option.some(node) : Option.none(),
  )

const hasLiveFolderWith =
  (predicate: (live: PinnedLiveFolderView) => boolean) => (view: SidebarView) =>
    Option.exists(liveFolderOf(view), predicate)

const isReady = hasLiveFolderWith((live) => live.status._tag === "Ready")
const hasFailed = hasLiveFolderWith((live) => live.status._tag === "Failed")

const temporaryUrls = (view: SidebarView): ReadonlyArray<string> =>
  Option.match(spaceNamed(view, "Home"), {
    onNone: () => [],
    onSome: (space) =>
      space.temporaryEntries.flatMap((entry) =>
        entry._tag === "TemporaryTab" ? [entry.tab.url] : entry.tabs.map((tab) => tab.url),
      ),
  })

const startWithSidebar = Effect.gen(function* () {
  const fake = yield* FakeBrowser
  const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
  yield* startBackground
  const sidebar = yield* openSidebar(windowId)
  const initial = yield* sidebar.viewWhere((v) => v.spaces.length === 1)
  return { windowId, sidebar, spaceId: initial.activeSpaceId }
})

const createLiveFolder = (source: LiveSource, parentId: BookmarkId | null = null) =>
  Effect.gen(function* () {
    const started = yield* startWithSidebar
    const outcome = yield* started.sidebar.run({
      _tag: "CreateLiveFolder",
      spaceId: started.spaceId,
      parentId,
      source,
    })
    return { ...started, outcome }
  })

const storedRecordIds = Effect.gen(function* () {
  const stored = yield* (yield* Storage).local.get("katip/live-folders/records")
  return Option.match(stored, {
    onNone: () => [],
    onSome: (records) => Object.keys(records as object),
  })
})

describe("creating a live folder", () => {
  it.live("a Gmail live folder fetches the unread emails and lists them as unread", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(
          gmailFeed(gmailEntry("1", "Invoice attached"), gmailEntry("2", "Meeting notes")),
        )

        const { sidebar, outcome } = yield* createLiveFolder(inbox)
        const view = yield* sidebar.viewWhere(isReady)
        const live = Option.getOrThrow(liveFolderOf(view))

        expect({
          created: outcome._tag === "Succeeded" ? outcome.createdBookmarkId : null,
          title: live.title,
          items: live.items.map((item) => [item.title, item.subtitle, item.isUnseen]),
        }).toStrictEqual({
          created: live.bookmarkId,
          title: "Gmail Inbox",
          items: [
            ["Invoice attached", "Hanako Sato", true],
            ["Meeting notes", "Hanako Sato", true],
          ],
        })
      }),
    ),
  )

  it.live(
    "without access to the source, makes no request and shows that allowing access fixes it",
    () =>
      inBackground(
        Effect.gen(function* () {
          const { sidebar } = yield* createLiveFolder(inbox)
          const view = yield* sidebar.viewWhere(hasFailed)

          expect([
            Option.map(liveFolderOf(view), (live) => live.status),
            yield* (yield* FakeHttp).requests,
          ]).toStrictEqual([
            Option.some({
              _tag: "Failed",
              reason: "Access to the source isn't allowed",
              needsPermission: true,
              needsToken: false,
              signInUrl: null,
            }),
            [],
          ])
        }),
      ),
  )

  it.live("once access is allowed, refreshes at once and lists the items", () =>
    inBackground(
      Effect.gen(function* () {
        yield* serveGmail(gmailFeed(gmailEntry("1", "Invoice attached")))
        const { sidebar } = yield* createLiveFolder(inbox)
        yield* sidebar.viewWhere(hasFailed)

        yield* grant(GMAIL_ORIGIN)
        const view = yield* sidebar.viewWhere(isReady)

        expect(
          Option.map(liveFolderOf(view), (live) => live.items.map((item) => item.title)),
        ).toStrictEqual(Option.some(["Invoice attached"]))
      }),
    ),
  )
})

describe("GitHub", () => {
  it.live("signed in to GitHub in the browser, lists review requests without a token", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
        yield* serveGitHubWeb(githubWebPage(["Add <em>live</em> folders"]))

        const { sidebar } = yield* createLiveFolder(reviewRequests)
        const view = yield* sidebar.viewWhere(isReady)

        expect(
          Option.map(liveFolderOf(view), (live) =>
            live.items.map((item) => [item.title, item.subtitle, item.url]),
          ),
        ).toStrictEqual(
          Option.some([
            [
              "Add live folders",
              "katip-dev/katip#200",
              "https://github.com/katip-dev/katip/pull/200",
            ],
          ]),
        )
      }),
    ),
  )

  it.live("not signed in to GitHub, shows that opening the sign-in page fixes it", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
        yield* serveGitHubWeb(githubWebPage([], { loggedIn: false }))

        const { sidebar } = yield* createLiveFolder(reviewRequests)
        const view = yield* sidebar.viewWhere(hasFailed)

        expect(Option.map(liveFolderOf(view), (live) => live.status)).toStrictEqual(
          Option.some({
            _tag: "Failed",
            reason: "You aren't signed in to GitHub",
            needsPermission: false,
            needsToken: false,
            signInUrl: "https://github.com/login",
          }),
        )
      }),
    ),
  )

  it.live("when the search page's response has changed shape, says it couldn't be read", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
        yield* serveGitHubWeb(JSON.stringify({ payload: { searchResults: [] } }))

        const { sidebar } = yield* createLiveFolder(reviewRequests)
        const view = yield* sidebar.viewWhere(hasFailed)

        expect(
          Option.map(liveFolderOf(view), (live) =>
            live.status._tag === "Failed" ? live.status.reason : live.status._tag,
          ),
        ).toStrictEqual(Option.some("Couldn't read the response from GitHub"))
      }),
    ),
  )

  it.live("setting a token refreshes through the official API", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
        yield* grant(GITHUB_API_ORIGIN)
        yield* serveGitHubWeb(githubWebPage(["Result from the search page"]))
        yield* (yield* FakeHttp).route("https://api.github.com/", () =>
          Effect.succeed(httpResponse(200, githubSearchBody("Result from the official API"))),
        )
        const { sidebar } = yield* createLiveFolder(reviewRequests)
        yield* sidebar.viewWhere(isReady)

        yield* sidebar.run({ _tag: "SetGitHubToken", token: "ghp_example" })
        const view = yield* sidebar.viewWhere(
          hasLiveFolderWith((live) =>
            live.items.some((item) => item.title === "Result from the official API"),
          ),
        )

        const requests = yield* (yield* FakeHttp).requests
        expect({
          titles: Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.title)),
          authorization: requests.at(-1)?.headers?.["Authorization"],
        }).toStrictEqual({
          titles: Option.some(["Result from the official API"]),
          authorization: "Bearer ghp_example",
        })
      }),
    ),
  )

  it.live("when the token is rejected, says it's invalid and that entering it again fixes it", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_API_ORIGIN)
        yield* (yield* FakeHttp).route("https://api.github.com/", () =>
          Effect.succeed(httpResponse(401, '{"message":"Bad credentials"}')),
        )
        const started = yield* startWithSidebar
        yield* started.sidebar.run({ _tag: "SetGitHubToken", token: "ghp_revoked" })

        yield* started.sidebar.run({
          _tag: "CreateLiveFolder",
          spaceId: started.spaceId,
          parentId: null,
          source: reviewRequests,
        })
        const view = yield* started.sidebar.viewWhere(hasFailed)

        expect(Option.map(liveFolderOf(view), (live) => live.status)).toStrictEqual(
          Option.some({
            _tag: "Failed",
            reason: "The GitHub access token is invalid",
            needsPermission: false,
            needsToken: true,
            signInUrl: null,
          }),
        )
      }),
    ),
  )
})

describe("when not signed in to Gmail", () => {
  it.live("redirected to sign-in, shows that opening that account's inbox fixes it", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* (yield* FakeHttp).route("https://mail.google.com/", () =>
          Effect.succeed(redirectResponse),
        )

        const { sidebar } = yield* createLiveFolder({ ...inbox, accountIndex: 1 })
        const view = yield* sidebar.viewWhere(hasFailed)

        expect(
          Option.map(liveFolderOf(view), (live) =>
            live.status._tag === "Failed" ? live.status.signInUrl : null,
          ),
        ).toStrictEqual(Option.some("https://mail.google.com/mail/u/1/"))
      }),
    ),
  )
})

describe("opening URLs", () => {
  it.live("opens a URL such as a sign-in page as a temporary tab of the Space being shown", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, windowId } = yield* startWithSidebar

        const outcome = yield* sidebar.run({
          _tag: "OpenUrl",
          windowId,
          url: "https://github.com/login",
        })
        const view = yield* sidebar.viewWhere((v) =>
          temporaryUrls(v).includes("https://github.com/login"),
        )

        expect([
          outcome._tag,
          temporaryUrls(view).includes("https://github.com/login"),
        ]).toStrictEqual(["Succeeded", true])
      }),
    ),
  )

  it.live("doesn't open URLs other than http and https", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, windowId } = yield* startWithSidebar
        const tabsBefore = (yield* (yield* FakeBrowser).snapshot).tabs.length

        const outcomes = yield* Effect.forEach(
          ["javascript:alert(1)", "chrome://settings/", "file:///etc/passwd", "not a url"],
          (url) => sidebar.run({ _tag: "OpenUrl", windowId, url }),
        )

        expect({
          outcomes,
          tabsAdded: (yield* (yield* FakeBrowser).snapshot).tabs.length - tabsBefore,
        }).toStrictEqual({
          outcomes: Array.replicate({ _tag: "Failed", reason: "This URL can't be opened" }, 4),
          tabsAdded: 0,
        })
      }),
    ),
  )
})

describe("sorting", () => {
  it.live("changing the sort reorders the items, and the order survives a refresh", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "Newer email"), gmailEntry("2", "Older email")))
        const { sidebar } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))

        yield* sidebar.run({
          _tag: "SetLiveFolderSort",
          bookmarkId: ready.bookmarkId,
          sort: "oldest",
        })
        yield* sidebar.viewWhere(hasLiveFolderWith((live) => live.sort === "oldest"))
        yield* sidebar.run({ _tag: "RefreshLiveFolder", bookmarkId: ready.bookmarkId })
        const view = yield* sidebar.viewWhere(
          hasLiveFolderWith((live) => live.sort === "oldest" && live.status._tag === "Ready"),
        )

        expect(
          Option.map(liveFolderOf(view), (live) => [live.sort, live.items.map((i) => i.title)]),
        ).toStrictEqual(Option.some(["oldest", ["Older email", "Newer email"]]))
      }),
    ),
  )

  it.live("a pin that isn't a live folder can't be sorted", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, spaceId } = yield* startWithSidebar
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null

        const outcome = yield* sidebar.run({
          _tag: "SetLiveFolderSort",
          bookmarkId: folderId ?? BookmarkId.make("missing"),
          sort: "title",
        })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "Live folder not found" })
      }),
    ),
  )
})

describe("opening items and marking them read", () => {
  it.live(
    "opening an item opens it as a temporary tab of the Space being shown and marks only it read",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* grant(GMAIL_ORIGIN)
          yield* serveGmail(
            gmailFeed(gmailEntry("1", "Invoice attached"), gmailEntry("2", "Meeting notes")),
          )
          const { sidebar, windowId } = yield* createLiveFolder(inbox)
          const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))
          const [first] = ready.items

          const outcome = yield* sidebar.run({
            _tag: "OpenLiveItem",
            windowId,
            bookmarkId: ready.bookmarkId,
            itemId: first?.id ?? "",
          })
          const view = yield* sidebar.viewWhere(
            (v) =>
              temporaryUrls(v).includes(first?.url ?? "") &&
              hasLiveFolderWith((live) => live.items.some((item) => !item.isUnseen))(v),
          )

          expect({
            outcome: outcome._tag,
            unseen: Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.isUnseen)),
            opened: temporaryUrls(view).filter((url) => url === first?.url).length,
          }).toStrictEqual({ outcome: "Succeeded", unseen: Option.some([false, true]), opened: 1 })
        }),
      ),
  )

  it.live("marking all as read marks every item read", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(
          gmailFeed(gmailEntry("1", "Invoice attached"), gmailEntry("2", "Meeting notes")),
        )
        const { sidebar } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))

        yield* sidebar.run({ _tag: "MarkLiveFolderSeen", bookmarkId: ready.bookmarkId })
        const view = yield* sidebar.viewWhere(
          hasLiveFolderWith((live) => live.items.every((item) => !item.isUnseen)),
        )

        expect(
          Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.isUnseen)),
        ).toStrictEqual(Option.some([false, false]))
      }),
    ),
  )

  it.live("an item that's gone can't be opened", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed())
        const { sidebar, windowId } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))

        const outcome = yield* sidebar.run({
          _tag: "OpenLiveItem",
          windowId,
          bookmarkId: ready.bookmarkId,
          itemId: "tag:gmail.google.com,2004:missing",
        })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "Item not found" })
      }),
    ),
  )
})

describe("refreshing", () => {
  it.live("refreshing replaces the items with what the source has now", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "Older email")))
        const { sidebar } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))
        yield* serveGmail(gmailFeed(gmailEntry("2", "Newer email")))

        yield* sidebar.run({ _tag: "RefreshLiveFolder", bookmarkId: ready.bookmarkId })
        const view = yield* sidebar.viewWhere(
          hasLiveFolderWith((live) => live.items.some((item) => item.title === "Newer email")),
        )

        expect(
          Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.title)),
        ).toStrictEqual(Option.some(["Newer email"]))
      }),
    ),
  )

  it.live("a pin that isn't a live folder can't be refreshed", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, spaceId } = yield* startWithSidebar
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null

        const outcome = yield* sidebar.run({
          _tag: "RefreshLiveFolder",
          bookmarkId: folderId ?? BookmarkId.make("missing"),
        })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "Live folder not found" })
      }),
    ),
  )
})

describe("as a bookmark folder", () => {
  it.live("can be moved into another folder, renamed, and collapsed", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed())
        const { sidebar, spaceId, outcome } = yield* createLiveFolder(inbox)
        const liveId = outcome._tag === "Succeeded" ? outcome.createdBookmarkId : null
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null
        if (liveId === null || folderId === null) return yield* Effect.die("couldn't create it")

        yield* sidebar.run({
          _tag: "MovePinnedItem",
          bookmarkId: liveId,
          placement: { spaceId, parentId: folderId, index: 0 },
        })
        yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: liveId, title: "Mail" })
        yield* sidebar.run({ _tag: "SetFolderExpanded", bookmarkId: liveId, isExpanded: false })
        const view = yield* sidebar.viewWhere((v) =>
          homeNodes(v).some(
            (node) =>
              node._tag === "PinnedFolder" &&
              node.children.some((child) => child._tag === "PinnedLiveFolder" && !child.isExpanded),
          ),
        )
        const moved = homeNodes(view).flatMap((node) =>
          node._tag === "PinnedFolder" ? node.children : [],
        )

        expect(
          moved.map((node) =>
            node._tag === "PinnedLiveFolder" ? [node.title, node.isExpanded] : node._tag,
          ),
        ).toStrictEqual([["Mail", false]])
      }),
    ),
  )

  it.live("deleting it also removes its cached items and its mark", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "Invoice attached")))
        const { sidebar } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))

        const outcome = yield* sidebar.run({
          _tag: "RemovePinnedItem",
          bookmarkId: ready.bookmarkId,
        })
        yield* sidebar.viewWhere((v) => Option.isNone(liveFolderOf(v)))

        expect({
          outcome: outcome._tag,
          records: yield* storedRecordIds,
          marks: Option.map(
            yield* (yield* Storage).local.get("katip/pinned/live-folders"),
            (marks) => Object.keys(marks as object),
          ),
        }).toStrictEqual({ outcome: "Succeeded", records: [], marks: Option.some([]) })
      }),
    ),
  )

  it.live("deleting the folder it's in also removes its cached items", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "Invoice attached")))
        const { sidebar, spaceId } = yield* startWithSidebar
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null
        if (folderId === null) return yield* Effect.die("couldn't create it")
        yield* sidebar.run({ _tag: "CreateLiveFolder", spaceId, parentId: folderId, source: inbox })
        yield* eventually(
          Effect.map(
            storedRecordIds,
            Option.liftPredicate((ids) => ids.length > 0),
          ),
        )

        yield* sidebar.run({ _tag: "DeleteFolder", bookmarkId: folderId })
        const records = yield* eventually(
          Effect.map(
            storedRecordIds,
            Option.liftPredicate((ids) => ids.length === 0),
          ),
        )

        expect(records).toStrictEqual([])
      }),
    ),
  )
})

describe("periodic refresh", () => {
  const findAlarm = Effect.map(
    Alarms.use((alarms) => alarms.getAll),
    (all) => all.find((alarm) => alarm.name === "katip/live-folders/refresh"),
  )

  it.live(
    "creating a live folder schedules periodic refreshes, and removing them all clears the schedule",
    () =>
      inBackground(
        Effect.gen(function* () {
          yield* grant(GMAIL_ORIGIN)
          yield* serveGmail(gmailFeed())
          const { sidebar, outcome } = yield* createLiveFolder(inbox)
          const scheduled = yield* findAlarm
          const liveId = outcome._tag === "Succeeded" ? outcome.createdBookmarkId : null

          yield* sidebar.run({
            _tag: "RemovePinnedItem",
            bookmarkId: liveId ?? BookmarkId.make("missing"),
          })

          expect([
            Option.getOrNull(Option.fromNullishOr(scheduled?.periodInMinutes).pipe(Option.flatten)),
            yield* findAlarm,
          ]).toStrictEqual([5, undefined])
        }),
      ),
  )

  // Seeds, before startup, a live folder in the bookmarks and the record of its last refresh
  const seedLiveFolder = (record: unknown | null) =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", {
        "katip/spaces": [{ id: "home", name: "Home", color: "grey" }],
      })
      const [root] = yield* fake.seedBookmarks(BookmarkId.make("2"), [
        {
          title: "Katip",
          children: [{ title: "Home", children: [{ title: "Inbox", children: [] }] }],
        },
      ])
      const childrenOf = (node: BookmarkNode | undefined) =>
        node?._tag === "BookmarkFolder" ? Option.getOrElse(node.children, () => []) : []
      const live = childrenOf(childrenOf(root)[0])[0]
      if (live === undefined) return yield* Effect.die("couldn't place the live folder")
      yield* fake.seedStorage("local", {
        "katip/pinned/live-folders": { [live.id]: inbox },
        ...(record !== null && { "katip/live-folders/records": { [live.id]: record } }),
      })
      const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
      return windowId
    })

  const startSeeded = (windowId: WindowId) => Effect.andThen(startBackground, openSidebar(windowId))

  it.live("opening the side panel refreshes live folders not fetched yet", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "Invoice attached")))
        const windowId = yield* seedLiveFolder(null)

        const sidebar = yield* startSeeded(windowId)
        const view = yield* sidebar.viewWhere(isReady)

        expect(
          Option.map(liveFolderOf(view), (live) => [live.title, live.items.map((i) => i.title)]),
        ).toStrictEqual(Option.some(["Inbox", ["Invoice attached"]]))
      }),
    ),
  )

  it.live(
    "at the scheduled time, refreshes live folders whose last refresh was long enough ago",
    () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* grant(GMAIL_ORIGIN)
          yield* serveGmail(gmailFeed(gmailEntry("2", "Newer email")))
          yield* seedLiveFolder({
            items: [
              {
                id: "old",
                title: "Older email",
                subtitle: "",
                url: "https://mail.google.com/mail/u/0/",
                updatedAt: 0,
              },
            ],
            lastAttempt: { _tag: "Fetched", at: 0 },
            seenVersions: {},
          })
          yield* startBackground
          yield* eventually(Effect.map(findAlarm, Option.fromNullishOr))

          yield* fake.fireAlarm("katip/live-folders/refresh")
          const records = yield* eventually(
            Effect.map((yield* Storage).local.get("katip/live-folders/records"), (stored) =>
              Option.filter(stored, (value) => JSON.stringify(value).includes("Newer email")),
            ),
          )

          expect([
            (yield* (yield* FakeHttp).requests).length,
            JSON.stringify(records),
          ]).toStrictEqual([1, expect.stringContaining("Newer email")])
        }),
      ),
  )
})
