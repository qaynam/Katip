import { Context, type Effect, Layer } from "effect"
import { type BrowserApiError, callChrome } from "./browser-api-error"
import type { TabId } from "./ids"

export class WebSearch extends Context.Service<
  WebSearch,
  {
    /** Searches `text` with the user's default search engine and shows the results in `tabId`. */
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
