import type { SpotlightMode, SpotlightOutcome, SpotlightResult } from "#protocol"
import type { SearchResponse, SpotlightConnection } from "../connection/spotlight-connection"

export interface RecordedSearch {
  readonly query: string
  readonly mode: SpotlightMode
}

interface PendingSearch extends RecordedSearch {
  readonly resolve: (response: SearchResponse | null) => void
}

export interface FakeConnection extends SpotlightConnection {
  /** In the order they were made. */
  readonly searches: ReadonlyArray<RecordedSearch>
  readonly chosen: ReadonlyArray<SpotlightResult>
  /** Answers the oldest unanswered search for `query`. */
  readonly answer: (
    query: string,
    results: ReadonlyArray<SpotlightResult>,
    options?: { readonly unreachable?: boolean },
  ) => Promise<void>
}

export interface FakeConnectionOptions {
  /**
   * When given, every search is answered at once with these results. Otherwise each search waits
   * for {@link FakeConnection.answer}.
   */
  readonly respond?: (query: string, mode: SpotlightMode) => ReadonlyArray<SpotlightResult>
  readonly outcome?: SpotlightOutcome
}

/** Stands in for the background, letting a test decide what each response holds and when it comes. */
export const createFakeConnection = (options: FakeConnectionOptions = {}): FakeConnection => {
  const searches: Array<RecordedSearch> = []
  const chosen: Array<SpotlightResult> = []
  const pending: Array<PendingSearch> = []

  return {
    searches,
    chosen,
    search: (query, mode) => {
      searches.push({ query, mode })
      const { respond } = options
      if (respond !== undefined) {
        return Promise.resolve({ results: respond(query, mode), spaceTheme: null })
      }
      return new Promise((resolve) => pending.push({ query, mode, resolve }))
    },
    choose: (result) => {
      chosen.push(result)
      return Promise.resolve(options.outcome ?? { _tag: "Succeeded" })
    },
    answer: async (query, results, answerOptions = {}) => {
      const index = pending.findIndex((search) => search.query === query)
      const [search] = pending.splice(index, 1)
      if (index === -1 || search === undefined) throw new Error(`No search for "${query}"`)
      search.resolve(answerOptions.unreachable === true ? null : { results, spaceTheme: null })
      await Promise.resolve()
    },
  }
}
