import { Option, pipe } from "effect"

// origin + pathname で比べると、chrome:// のように origin が "null" になる URL 同士が
// すべて同じページに見えてしまう。クエリとハッシュだけを落とした href で比べる
const pageAddressOf = (url: string): string =>
  pipe(
    Option.fromNullishOr(URL.parse(url)),
    Option.map((parsed) => {
      parsed.search = ""
      parsed.hash = ""
      return parsed.href
    }),
    Option.getOrElse(() => url),
  )

/**
 * ピン留めした URL から別のページへ移動したかを判定する。
 *
 * クエリとハッシュの違いは移動とみなさない。URL として解釈できない文字列は、文字列として比べる。
 */
export const hasNavigatedAway = (pinnedUrl: string, currentUrl: string): boolean =>
  pageAddressOf(pinnedUrl) !== pageAddressOf(currentUrl)
