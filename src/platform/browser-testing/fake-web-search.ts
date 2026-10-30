import { Effect, Option } from "effect"
import { WebSearch } from "#platform/browser"
import { emitTabUpdated, requireTab, updateTab } from "./browsing-steps"
import { type FakeWorld, transact } from "./fake-world"

/** fake の既定の検索エンジンが `text` の検索結果として開く URL。 */
export const fakeSearchUrl = (text: string): string =>
  `https://search.example/?q=${encodeURIComponent(text)}`

export const makeFakeWebSearch = (world: FakeWorld): WebSearch["Service"] =>
  WebSearch.of({
    query: (text, tabId) =>
      transact(
        world,
        "search.query",
        Effect.fnUntraced(function* (tx) {
          yield* requireTab(tx, tabId)
          const url = fakeSearchUrl(text)
          yield* updateTab(tx, tabId, (tab) => ({ ...tab, url: Option.some(url) }))
          yield* emitTabUpdated(tx, tabId, { url })
        }),
      ),
  })
