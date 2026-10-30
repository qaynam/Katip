import type { SpotlightOutcome, SpotlightResult } from "#protocol"
import type { SearchResponse, SpotlightConnection } from "../connection/spotlight-connection"

interface PendingSearch {
  readonly query: string
  readonly resolve: (response: SearchResponse | null) => void
}

export interface FakeConnection extends SpotlightConnection {
  /** 問い合わせられた検索語。問い合わせた順。 */
  readonly searchedQueries: ReadonlyArray<string>
  readonly chosen: ReadonlyArray<SpotlightResult>
  /** まだ答えていない `query` の問い合わせに、古いものから 1 つ答える。 */
  readonly answer: (
    query: string,
    results: ReadonlyArray<SpotlightResult>,
    options?: { readonly unreachable?: boolean },
  ) => Promise<void>
}

export interface FakeConnectionOptions {
  /** 指定すると、問い合わせにすぐこの結果で答える。省略時は {@link FakeConnection.answer} を待つ。 */
  readonly respond?: (query: string) => ReadonlyArray<SpotlightResult>
  readonly outcome?: SpotlightOutcome
}

/** テストから応答の中身と順序を決められる、background の代わり。 */
export const createFakeConnection = (options: FakeConnectionOptions = {}): FakeConnection => {
  const searchedQueries: Array<string> = []
  const chosen: Array<SpotlightResult> = []
  const pending: Array<PendingSearch> = []

  return {
    searchedQueries,
    chosen,
    search: (query) => {
      searchedQueries.push(query)
      const { respond } = options
      if (respond !== undefined)
        return Promise.resolve({ results: respond(query), spaceTheme: null })
      return new Promise((resolve) => pending.push({ query, resolve }))
    },
    choose: (result) => {
      chosen.push(result)
      return Promise.resolve(options.outcome ?? { _tag: "Succeeded" })
    },
    answer: async (query, results, answerOptions = {}) => {
      const index = pending.findIndex((search) => search.query === query)
      const [search] = pending.splice(index, 1)
      if (index === -1 || search === undefined) throw new Error(`「${query}」の問い合わせが無い`)
      search.resolve(answerOptions.unreachable === true ? null : { results, spaceTheme: null })
      await Promise.resolve()
    },
  }
}
