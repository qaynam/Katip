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

describe("searching seeded browsing history", () => {
  it.effect(
    "returns pages containing every word in the URL or title, most recently visited first",
    () =>
      Effect.gen(function* () {
        yield* (yield* FakeHistory).seed([
          page("https://docs.example/effect", "Effect documentation", 100),
          page("https://blog.example/effect", "Trying out Effect", 300),
          page("https://docs.example/svelte", "Svelte", 200),
        ])

        assert.deepStrictEqual(yield* urlsFound("EFFECT"), [
          "https://blog.example/effect",
          "https://docs.example/effect",
        ])
      }).pipe(Effect.provide(FakeHistory.layer)),
  )

  it.effect("leaves out pages visited before the start time and results beyond the limit", () =>
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

  it.effect("records the searches it receives", () =>
    Effect.gen(function* () {
      yield* urlsFound("katip", { maxResults: 50 })

      assert.deepStrictEqual(yield* (yield* FakeHistory).searches, [
        { text: "katip", maxResults: 50, startTime: 0 },
      ])
    }).pipe(Effect.provide(FakeHistory.layer)),
  )
})
