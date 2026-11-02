import { Option, pipe } from "effect"

// Not origin + pathname: URLs whose origin is "null", such as chrome:// ones, would all look like
// the same page. Compare the href with only the query and hash dropped
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
 * Tells whether the tab has moved from the pinned URL to another page.
 *
 * A different query or hash doesn't count as moving. Strings that don't parse as URLs are
 * compared as plain strings.
 */
export const hasNavigatedAway = (pinnedUrl: string, currentUrl: string): boolean =>
  pageAddressOf(pinnedUrl) !== pageAddressOf(currentUrl)
