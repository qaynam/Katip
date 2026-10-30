import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FakeHistory } from "./fake-history"
import { History, type HistoryPage } from "./history"

const page = (url: string, title: string, lastVisitedAt: number): HistoryPage => ({
  url,
  title,
  lastVisitedAt,
})

const urlsFound = (text: string, options: { maxResults?: number; startTime?: number } = {}) =>
  History.use((history) =>
    history.search({
      text,
      maxResults: options.maxResults ?? 100,
      startTime: options.startTime ?? 0,
    }),
  ).pipe(Effect.map((pages) => pages.map((found) => found.url)))

describe("仕込んだ閲覧履歴の検索", () => {
  it.effect("すべての語を URL かタイトルに含むページを、最後に訪れたのが新しい順に返す", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHistory).seed([
        page("https://docs.example/effect", "Effect のドキュメント", 100),
        page("https://blog.example/effect", "Effect を使ってみた", 300),
        page("https://docs.example/svelte", "Svelte", 200),
      ])

      assert.deepStrictEqual(yield* urlsFound("EFFECT"), [
        "https://blog.example/effect",
        "https://docs.example/effect",
      ])
    }).pipe(Effect.provide(FakeHistory.layer)),
  )

  it.effect("開始時刻より前に訪れたページと、上限を超えた分は返さない", () =>
    Effect.gen(function* () {
      yield* (yield* FakeHistory).seed([
        page("https://a.example/", "A", 100),
        page("https://b.example/", "B", 200),
        page("https://c.example/", "C", 300),
      ])

      assert.deepStrictEqual(yield* urlsFound("", { startTime: 150, maxResults: 1 }), [
        "https://c.example/",
      ])
    }).pipe(Effect.provide(FakeHistory.layer)),
  )

  it.effect("受けた検索を記録する", () =>
    Effect.gen(function* () {
      yield* urlsFound("katip", { maxResults: 50 })

      assert.deepStrictEqual(yield* (yield* FakeHistory).searches, [
        { text: "katip", maxResults: 50, startTime: 0 },
      ])
    }).pipe(Effect.provide(FakeHistory.layer)),
  )
})
