import { Context, type Effect, Layer } from "effect"
import { type BrowserApiError, callChrome } from "./browser-api-error"
import type { TabId } from "./ids"

export class WebSearch extends Context.Service<
  WebSearch,
  {
    /** ユーザーが選んだ既定の検索エンジンで `text` を検索し、結果を `tabId` のタブに表示する。 */
    query(text: string, tabId: TabId): Effect.Effect<void, BrowserApiError>
  }
>()("katip/platform/browser/WebSearch") {
  static readonly layer = Layer.succeed(
    WebSearch,
    WebSearch.of({
      query: (text, tabId) =>
        callChrome("search.query", () => chrome.search.query({ text, tabId })),
    }),
  )
}
