import { Array, Context, Effect, Layer, Order, Ref } from "effect"
import { History, type HistoryPage, type HistoryQuery } from "./history"

const matchesText = (page: HistoryPage, text: string): boolean => {
  const haystack = `${page.url} ${page.title}`.toLowerCase()
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "")
    .every((term) => haystack.includes(term))
}

const byLastVisitDescending = Order.flip(
  Order.mapInput(Order.Number, (page: HistoryPage) => page.lastVisitedAt),
)

/**
 * For tests: serves seeded browsing history as {@link History} and records the searches it
 * receives. `FakeHistory.layer` provides this and {@link History} sharing the same state.
 */
export class FakeHistory extends Context.Service<
  FakeHistory,
  {
    seed(pages: ReadonlyArray<HistoryPage>): Effect.Effect<void>
    /** The searches received, in the order received. */
    readonly searches: Effect.Effect<ReadonlyArray<HistoryQuery>>
  }
>()("katip/platform/history/FakeHistory") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const pages = yield* Ref.make<ReadonlyArray<HistoryPage>>([])
      const searches = yield* Ref.make<ReadonlyArray<HistoryQuery>>([])

      const search = (query: HistoryQuery) =>
        Effect.gen(function* () {
          yield* Ref.update(searches, (all) => [...all, query])
          const found = (yield* Ref.get(pages)).filter(
            (page) => page.lastVisitedAt >= query.startTime && matchesText(page, query.text),
          )
          return Array.sort(found, byLastVisitDescending).slice(0, query.maxResults)
        })

      return Context.make(History, History.of({ search })).pipe(
        Context.add(
          FakeHistory,
          FakeHistory.of({
            seed: (seeded) => Ref.update(pages, (all) => [...all, ...seeded]),
            searches: Ref.get(searches),
          }),
        ),
      )
    }),
  )
}
