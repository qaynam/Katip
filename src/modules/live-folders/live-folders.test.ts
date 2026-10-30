import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Layer, Option } from "effect"
import { BookmarkId } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { FakeHttp, httpResponse, unreachable, type HttpResponse } from "#platform/http"
import { FakePermissions } from "#platform/permissions"
import { isUnseen } from "./live-folder-record"
import { LiveFolders } from "./live-folders"
import type { LiveSource } from "./live-source"

const TestLayer = LiveFolders.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(FakeHttp.layer, FakePermissions.layer, FakeBrowser.layer)),
)

const FOLDER = BookmarkId.make("live-1")
const inbox: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }

const entry = (id: string, title: string) =>
  `<entry><title>${title}</title><link rel="alternate" href="https://mail.google.com/mail?message_id=${id}" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><id>${id}</id><author><name>差出人</name></author></entry>`

const feed = (...entries: ReadonlyArray<string>) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><fullcount>${entries.length}</fullcount>${entries.join("")}</feed>`

const serveFeed = (xml: string) =>
  FakeHttp.use((http) =>
    http.route("https://mail.google.com/", () => Effect.succeed(httpResponse(200, xml))),
  )

const grantGmail = FakePermissions.use((permissions) =>
  permissions.grant(["https://mail.google.com/*"]),
)

const snapshot = LiveFolders.use((folders) => folders.snapshot)

const settled = snapshot.pipe(
  Effect.tap(() => Effect.yieldNow),
  Effect.repeat({ until: (current) => current.refreshing.size === 0, times: 100 }),
)

const recordOf = Effect.map(settled, (current) => Option.fromNullishOr(current.records.get(FOLDER)))

const refreshAndSettle = Effect.andThen(
  LiveFolders.use((folders) => folders.refresh(FOLDER, inbox)),
  recordOf,
)

describe("取得", () => {
  it.effect("取得している間は取得中になり、終わると取得した項目が残る", () =>
    Effect.gen(function* () {
      yield* grantGmail
      const response = yield* Deferred.make<HttpResponse>()
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Deferred.await(response))
      const folders = yield* LiveFolders

      yield* folders.refresh(FOLDER, inbox)
      const during = yield* snapshot
      yield* Deferred.succeed(response, httpResponse(200, feed(entry("a", "請求書"))))
      const record = yield* recordOf

      assert.deepStrictEqual(
        [
          during.refreshing.has(FOLDER),
          Option.map(record, (r) => r.items.map((item) => item.title)),
        ],
        [true, Option.some(["請求書"])],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("取得している間にもう一度取得しても、取得元へは 1 回しか問い合わせない", () =>
    Effect.gen(function* () {
      yield* grantGmail
      const response = yield* Deferred.make<HttpResponse>()
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Deferred.await(response))
      const folders = yield* LiveFolders

      yield* folders.refresh(FOLDER, inbox)
      yield* folders.refresh(FOLDER, inbox)
      yield* Deferred.succeed(response, httpResponse(200, feed()))
      yield* settled

      assert.strictEqual((yield* (yield* FakeHttp).requests).length, 1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("失敗したら、前回取得した項目を残したまま失敗を残す", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "請求書")))
      yield* refreshAndSettle
      yield* (yield* FakeHttp).route("https://mail.google.com/", unreachable)

      const record = Option.getOrThrow(yield* refreshAndSettle)

      assert.deepStrictEqual(
        [record.items.map((item) => item.title), record.lastAttempt._tag],
        [["請求書"], "Failed"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("既読", () => {
  it.effect("開いた項目だけが既読になる", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "A"), entry("b", "B")))
      yield* refreshAndSettle

      yield* (yield* LiveFolders).markItemSeen(FOLDER, "b")

      const record = Option.getOrThrow(yield* recordOf)
      assert.deepStrictEqual(
        record.items.map((item) => isUnseen(record, item)),
        [true, false],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("まとめて既読にすると、すべての項目が既読になる", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "A"), entry("b", "B")))
      yield* refreshAndSettle

      yield* (yield* LiveFolders).markAllSeen(FOLDER)

      const record = Option.getOrThrow(yield* recordOf)
      assert.deepStrictEqual(
        record.items.map((item) => isUnseen(record, item)),
        [false, false],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("忘れる", () => {
  it.effect("取得した項目を捨てる", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "A")))
      yield* refreshAndSettle

      yield* (yield* LiveFolders).forget([FOLDER])

      assert.deepStrictEqual(yield* recordOf, Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("取得している途中なら取得を止め、後から結果が残ることもない", () =>
    Effect.gen(function* () {
      yield* grantGmail
      const response = yield* Deferred.make<HttpResponse>()
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Deferred.await(response))
      const folders = yield* LiveFolders
      yield* folders.refresh(FOLDER, inbox)

      yield* folders.forget([FOLDER])
      yield* Deferred.succeed(response, httpResponse(200, feed(entry("a", "A"))))
      const current = yield* settled

      assert.deepStrictEqual(
        [current.refreshing.has(FOLDER), current.records.has(FOLDER)],
        [false, false],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})
