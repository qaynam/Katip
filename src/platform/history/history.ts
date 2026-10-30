import { Array, Context, Effect, Layer, Option } from "effect"
import { BrowserApiError } from "#platform/browser"

export interface HistoryPage {
  readonly url: string
  /** タイトルを記録していないページは空文字。 */
  readonly title: string
  /** 最後に訪れた時刻（エポックミリ秒）。 */
  readonly lastVisitedAt: number
}

export interface HistoryQuery {
  /** URL かタイトルに含まれる語。空文字ならすべて。 */
  readonly text: string
  readonly maxResults: number
  /** この時刻（エポックミリ秒）以降に訪れたページだけを探す。 */
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
     * 閲覧履歴を、最後に訪れたのが新しい順に探す。
     *
     * `history` の権限が無いと失敗する。権限は `#platform/permissions` で先に確かめること。
     */
    search(query: HistoryQuery): Effect.Effect<ReadonlyArray<HistoryPage>, BrowserApiError>
  }
>()("katip/platform/history/History") {
  // 権限が無いと chrome.history そのものが無いので、使うときまで読まない
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
