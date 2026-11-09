import type { Bang, BangFormat } from "./bang"

const PLACEHOLDER = "%s"

const encodedQuery = (query: string, format: BangFormat) => {
  if (!format.encodesQuery) return query
  const encoded = encodeURIComponent(query)
  return format.encodesSpaceAsPlus ? encoded.replaceAll("%20", "+") : encoded
}

/**
 * The top page of the site a bang searches, such as `https://github.com/`.
 *
 * @remarks
 * A few bangs put the search terms in the host name, as in `https://%s.wordpress.com/`; their site
 * is the host without that label.
 */
export const siteUrlOf = (bang: Bang): string =>
  `${new URL(bang.template.replaceAll(`${PLACEHOLDER}.`, "").replaceAll(PLACEHOLDER, "")).origin}/`

/** Whether the bang searches for what is typed after it, rather than always opening one page. */
export const searchesWithQuery = (bang: Bang): boolean => bang.template.includes(PLACEHOLDER)

/**
 * The page the bang opens for `query`: its URL with the query filled in.
 *
 * @remarks
 * With a blank query, a bang whose format says so opens its site's top page instead of a search for
 * nothing. A bang without a place for the query opens its URL as it is, whatever the query.
 */
export const bangUrl = (bang: Bang, query: string): string => {
  const trimmed = query.trim()
  if (!searchesWithQuery(bang)) return bang.template
  if (trimmed === "" && bang.format.opensTopPageWithoutQuery) return siteUrlOf(bang)
  return bang.template.replaceAll(PLACEHOLDER, encodedQuery(trimmed, bang.format))
}
