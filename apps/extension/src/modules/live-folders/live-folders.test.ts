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
  `<entry><title>${title}</title><link rel="alternate" href="https://mail.google.com/mail?message_id=${id}" type="text/html" /><modified>2026-10-30T09:10:01Z</modified><id>${id}</id><author><name>Sender</name></author></entry>`

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

describe("refreshing", () => {
  it.effect("is refreshing while the fetch runs, and keeps the fetched items once it ends", () =>
    Effect.gen(function* () {
      yield* grantGmail
      const response = yield* Deferred.make<HttpResponse>()
      yield* (yield* FakeHttp).route("https://mail.google.com/", () => Deferred.await(response))
      const folders = yield* LiveFolders

      yield* folders.refresh(FOLDER, inbox)
      const during = yield* snapshot
      yield* Deferred.succeed(response, httpResponse(200, feed(entry("a", "Invoice"))))
      const record = yield* recordOf

      assert.deepStrictEqual(
        [
          during.refreshing.has(FOLDER),
          Option.map(record, (r) => r.items.map((item) => item.title)),
        ],
        [true, Option.some(["Invoice"])],
      )
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refreshing again while a fetch runs asks the source only once", () =>
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

  it.effect("on failure, keeps the previously fetched items and records the failure", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "Invoice")))
      yield* refreshAndSettle
      yield* (yield* FakeHttp).route("https://mail.google.com/", unreachable)

      const record = Option.getOrThrow(yield* refreshAndSettle)

      assert.deepStrictEqual(
        [record.items.map((item) => item.title), record.lastAttempt._tag],
        [["Invoice"], "Failed"],
      )
    }).pipe(Effect.provide(TestLayer)),
  )
})

describe("seen items", () => {
  it.effect("only the opened item becomes read", () =>
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

  it.effect("marking all as seen makes every item read", () =>
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

describe("forgetting", () => {
  it.effect("discards the fetched items", () =>
    Effect.gen(function* () {
      yield* grantGmail
      yield* serveFeed(feed(entry("a", "A")))
      yield* refreshAndSettle

      yield* (yield* LiveFolders).forget([FOLDER])

      assert.deepStrictEqual(yield* recordOf, Option.none())
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("stops a fetch in progress, so its outcome isn't kept later either", () =>
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

describe("sort order", () => {
  it.effect(
    "remembers the chosen order, and stores nothing once back to the default newest first",
    () =>
      Effect.gen(function* () {
        const folders = yield* LiveFolders

        yield* folders.setSort(FOLDER, "title")
        const titled = (yield* snapshot).sorts.get(FOLDER)
        yield* folders.setSort(FOLDER, "newest")
        const reset = (yield* snapshot).sorts.has(FOLDER)

        assert.deepStrictEqual([titled, reset], ["title", false])
      }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("discards the order of a forgotten folder too", () =>
    Effect.gen(function* () {
      const folders = yield* LiveFolders
      yield* folders.setSort(FOLDER, "oldest")

      yield* folders.forget([FOLDER])

      assert.isFalse((yield* snapshot).sorts.has(FOLDER))
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("discards the order of folders not among those kept", () =>
    Effect.gen(function* () {
      const folders = yield* LiveFolders
      const kept = BookmarkId.make("live-2")
      yield* folders.setSort(FOLDER, "oldest")
      yield* folders.setSort(kept, "source")

      yield* folders.retainOnly(new Set([kept]))

      assert.deepStrictEqual([...(yield* snapshot).sorts.entries()], [[kept, "source"]])
    }).pipe(Effect.provide(TestLayer)),
  )
})
