import { describe, expect, it } from "@effect/vitest"
import { Array, Effect, Option, type Scope, type Layer } from "effect"
import type { LiveSource } from "#modules/live-folders"
import { Alarms, BookmarkId, Storage, type BookmarkNode, type WindowId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse } from "#platform/http"
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
const GITHUB_ORIGIN = "https://api.github.com/*"
const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }
const reviewRequests: LiveSource = { _tag: "GitHub", query: "review-requested" }

const gmailEntry = (id: string, subject: string) =>
  `<entry><title>${subject}</title><summary>本文の冒頭</summary><link rel="alternate" href="https://mail.google.com/mail?account_id=taro.yamada@gmail.com&amp;message_id=${id}&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><issued>2026-10-30T09:10:01Z</issued><id>tag:gmail.google.com,2004:${id}</id><author><name>佐藤 花子</name><email>hanako.sato@example.co.jp</email></author></entry>`

const gmailFeed = (...entries: ReadonlyArray<string>) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for taro.yamada@gmail.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>${entries.length}</fullcount><link rel="alternate" href="https://mail.google.com/mail" type="text/html" /><modified>2026-10-30T09:12:44Z</modified>${entries.join("")}</feed>`

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

const serveGmail = (xml: string) =>
  FakeHttp.use((http) =>
    http.route("https://mail.google.com/", () => Effect.succeed(httpResponse(200, xml))),
  )

const grant = (origin: string) => FakePermissions.use((permissions) => permissions.grant([origin]))

const homeNodes = (view: SidebarView): ReadonlyArray<PinnedNodeView> =>
  Option.match(spaceNamed(view, "ホーム"), {
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
  Option.match(spaceNamed(view, "ホーム"), {
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

describe("ライブフォルダの作成", () => {
  it.live("Gmail のライブフォルダを作ると、未読のメールを取り込んで未読として並べる", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付"), gmailEntry("2", "議事録")))

        const { sidebar, outcome } = yield* createLiveFolder(inbox)
        const view = yield* sidebar.viewWhere(isReady)
        const live = Option.getOrThrow(liveFolderOf(view))

        expect({
          created: outcome._tag === "Succeeded" ? outcome.createdBookmarkId : null,
          title: live.title,
          items: live.items.map((item) => [item.title, item.subtitle, item.isUnseen]),
        }).toStrictEqual({
          created: live.bookmarkId,
          title: "Gmail の受信トレイ",
          items: [
            ["請求書の送付", "佐藤 花子", true],
            ["議事録", "佐藤 花子", true],
          ],
        })
      }),
    ),
  )

  it.live("取得元へのアクセスが許可されていなければ、問い合わせずに許可を求めれば直ると示す", () =>
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
            reason: "取得元へのアクセスが許可されていません",
            needsPermission: true,
            needsToken: false,
          }),
          [],
        ])
      }),
    ),
  )

  it.live("アクセスが許可されると、すぐに取得し直して項目が並ぶ", () =>
    inBackground(
      Effect.gen(function* () {
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付")))
        const { sidebar } = yield* createLiveFolder(inbox)
        yield* sidebar.viewWhere(hasFailed)

        yield* grant(GMAIL_ORIGIN)
        const view = yield* sidebar.viewWhere(isReady)

        expect(
          Option.map(liveFolderOf(view), (live) => live.items.map((item) => item.title)),
        ).toStrictEqual(Option.some(["請求書の送付"]))
      }),
    ),
  )
})

describe("GitHub のトークン", () => {
  it.live("トークンが無ければ入れ直せば直ると示し、トークンを入れるとそれで取得し直す", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
        yield* (yield* FakeHttp).route("https://api.github.com/", () =>
          Effect.succeed(httpResponse(200, githubSearchBody("ライブフォルダを追加する"))),
        )
        const { sidebar } = yield* createLiveFolder(reviewRequests)
        const failed = yield* sidebar.viewWhere(hasFailed)

        yield* sidebar.run({ _tag: "SetGitHubToken", token: "ghp_example" })
        const view = yield* sidebar.viewWhere(isReady)

        const [request] = yield* (yield* FakeHttp).requests
        expect({
          before: Option.map(liveFolderOf(failed), (live) => live.status),
          after: Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.subtitle)),
          authorization: request?.headers?.["Authorization"],
        }).toStrictEqual({
          before: Option.some({
            _tag: "Failed",
            reason: "GitHub のアクセストークンが設定されていません",
            needsPermission: false,
            needsToken: true,
          }),
          after: Option.some(["katip-dev/katip#100"]),
          authorization: "Bearer ghp_example",
        })
      }),
    ),
  )

  it.live("トークンを受け付けられなければ、トークンが無効なので入れ直せば直ると示す", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GITHUB_ORIGIN)
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
            reason: "GitHub のアクセストークンが無効です",
            needsPermission: false,
            needsToken: true,
          }),
        )
      }),
    ),
  )
})

describe("項目を開く・既読にする", () => {
  it.live("項目を開くと、見ている Space の一時タブとして開き、その項目だけが既読になる", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付"), gmailEntry("2", "議事録")))
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

  it.live("まとめて既読にすると、すべての項目が既読になる", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付"), gmailEntry("2", "議事録")))
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

  it.live("無くなった項目は開けない", () =>
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

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "項目が見つかりません" })
      }),
    ),
  )
})

describe("取得し直す", () => {
  it.live("取得し直すと、取得元の今の中身に置き換わる", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "古いメール")))
        const { sidebar } = yield* createLiveFolder(inbox)
        const ready = Option.getOrThrow(liveFolderOf(yield* sidebar.viewWhere(isReady)))
        yield* serveGmail(gmailFeed(gmailEntry("2", "新しいメール")))

        yield* sidebar.run({ _tag: "RefreshLiveFolder", bookmarkId: ready.bookmarkId })
        const view = yield* sidebar.viewWhere(
          hasLiveFolderWith((live) => live.items.some((item) => item.title === "新しいメール")),
        )

        expect(
          Option.map(liveFolderOf(view), (live) => live.items.map((i) => i.title)),
        ).toStrictEqual(Option.some(["新しいメール"]))
      }),
    ),
  )

  it.live("ライブフォルダでないピンは取得し直せない", () =>
    inBackground(
      Effect.gen(function* () {
        const { sidebar, spaceId } = yield* startWithSidebar
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null

        const outcome = yield* sidebar.run({
          _tag: "RefreshLiveFolder",
          bookmarkId: folderId ?? BookmarkId.make("missing"),
        })

        expect(outcome).toStrictEqual({ _tag: "Failed", reason: "ライブフォルダが見つかりません" })
      }),
    ),
  )
})

describe("ブックマークのフォルダとしての操作", () => {
  it.live("ほかのフォルダの中へ移し、改名し、閉じられる", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed())
        const { sidebar, spaceId, outcome } = yield* createLiveFolder(inbox)
        const liveId = outcome._tag === "Succeeded" ? outcome.createdBookmarkId : null
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null
        if (liveId === null || folderId === null) return yield* Effect.die("作れなかった")

        yield* sidebar.run({
          _tag: "MovePinnedItem",
          bookmarkId: liveId,
          placement: { spaceId, parentId: folderId, index: 0 },
        })
        yield* sidebar.run({ _tag: "RenamePinnedItem", bookmarkId: liveId, title: "メール" })
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
        ).toStrictEqual([["メール", false]])
      }),
    ),
  )

  it.live("削除すると、取得した中身のキャッシュと印も消える", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付")))
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

  it.live("入っているフォルダごと削除しても、取得した中身のキャッシュが消える", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付")))
        const { sidebar, spaceId } = yield* startWithSidebar
        const folder = yield* sidebar.run({ _tag: "CreateFolder", spaceId, parentId: null })
        const folderId = folder._tag === "Succeeded" ? folder.createdBookmarkId : null
        if (folderId === null) return yield* Effect.die("作れなかった")
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

describe("定期的な取得", () => {
  const findAlarm = Effect.map(
    Alarms.use((alarms) => alarms.getAll),
    (all) => all.find((alarm) => alarm.name === "katip/live-folders/refresh"),
  )

  it.live("ライブフォルダを作ると定期的な取得が予約され、すべて消すと予約も消える", () =>
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

  // ブックマークに置いたライブフォルダと、前回の取得の記録を起動前に仕込む
  const seedLiveFolder = (record: unknown | null) =>
    Effect.gen(function* () {
      const fake = yield* FakeBrowser
      yield* fake.seedStorage("local", {
        "katip/spaces": [{ id: "home", name: "ホーム", color: "grey" }],
      })
      const [root] = yield* fake.seedBookmarks(BookmarkId.make("2"), [
        {
          title: "Katip",
          children: [{ title: "ホーム", children: [{ title: "受信トレイ", children: [] }] }],
        },
      ])
      const childrenOf = (node: BookmarkNode | undefined) =>
        node?._tag === "BookmarkFolder" ? Option.getOrElse(node.children, () => []) : []
      const live = childrenOf(childrenOf(root)[0])[0]
      if (live === undefined) return yield* Effect.die("ライブフォルダを置けなかった")
      yield* fake.seedStorage("local", {
        "katip/pinned/live-folders": { [live.id]: inbox },
        ...(record !== null && { "katip/live-folders/records": { [live.id]: record } }),
      })
      const { windowId } = yield* fake.seedWindow({ tabs: [{ url: "https://a.example/" }] })
      return windowId
    })

  const startSeeded = (windowId: WindowId) => Effect.andThen(startBackground, openSidebar(windowId))

  it.live("サイドパネルを開くと、まだ取得していないライブフォルダを取得する", () =>
    inBackground(
      Effect.gen(function* () {
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("1", "請求書の送付")))
        const windowId = yield* seedLiveFolder(null)

        const sidebar = yield* startSeeded(windowId)
        const view = yield* sidebar.viewWhere(isReady)

        expect(
          Option.map(liveFolderOf(view), (live) => [live.title, live.items.map((i) => i.title)]),
        ).toStrictEqual(Option.some(["受信トレイ", ["請求書の送付"]]))
      }),
    ),
  )

  it.live("予約した時刻になると、前回の取得から間が空いたライブフォルダを取得し直す", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* grant(GMAIL_ORIGIN)
        yield* serveGmail(gmailFeed(gmailEntry("2", "新しいメール")))
        yield* seedLiveFolder({
          items: [
            {
              id: "old",
              title: "古いメール",
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
            Option.filter(stored, (value) => JSON.stringify(value).includes("新しいメール")),
          ),
        )

        expect([(yield* (yield* FakeHttp).requests).length, JSON.stringify(records)]).toStrictEqual(
          [1, expect.stringContaining("新しいメール")],
        )
      }),
    ),
  )
})
