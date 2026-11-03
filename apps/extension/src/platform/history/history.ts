import { Array, Context, Effect, Layer, Option } from "effect"
import { BrowserApiError } from "#platform/browser"

export interface HistoryPage {
  readonly url: string
  /** Empty for a page with no recorded title. */
  readonly title: string
  /** When the page was last visited, in epoch milliseconds. */
  readonly lastVisitedAt: number
}

export interface HistoryQuery {
  /** Words to find in the URL or title; an empty string matches every page. */
  readonly text: string
  readonly maxResults: number
  /** Only pages visited at or after this time, in epoch milliseconds, are searched. */
  readonly startTime: number
}

const pageFrom = (item: chrome.history.HistoryItem): Option.Option<HistoryPage> =>
  Option.all({
    url: Option.fromNullishOr(item.url),
    lastVisitedAt: Option.fromNullishOr(item.lastVisitTime),
  }).pipe(Option.map(({ url, lastVisitedAt }) => ({ url, title: item.title ?? "", lastVisitedAt })))

export class History extends Context.Service<
  History,
  {
    /**
     * Searches browsing history, most recently visited first.
     *
     * Fails without the `history` permission; check it first with `#platform/permissions`.
     */
    search(query: HistoryQuery): Effect.Effect<ReadonlyArray<HistoryPage>, BrowserApiError>
  }
>()("katip/platform/history/History") {
  // chrome.history is not read until used: it does not exist at all without the permission
  static readonly layer = Layer.succeed(
    History,
    History.of({
      search: (query) =>
        Effect.tryPromise({
          try: () =>
            chrome.history.search({
              text: query.text,
              maxResults: query.maxResults,
              startTime: query.startTime,
            }),
          catch: (cause) => new BrowserApiError({ api: "history.search", cause }),
        }).pipe(Effect.map((items) => Array.getSomes(items.map(pageFrom)))),
    }),
  )
}
