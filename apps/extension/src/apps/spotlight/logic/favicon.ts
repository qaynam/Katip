import { Option, Predicate } from "effect"
import { hostOf } from "./readable-url"

/** Makes a favicon image URL from a page URL. Returns null where none can be made. */
export type FaviconResolver = (pageUrl: string) => string | null

// The tab's own favicon comes first: one that changes, such as with an unread count, is fresher
// there than in the cache. Closed pins and bookmarks have no tab, so only the page URL is left
// for them
export const faviconCandidates = (
  pageUrl: string,
  favIconUrl: string | null,
  resolve: FaviconResolver,
): ReadonlyArray<string> => {
  const candidates = [favIconUrl, pageUrl === "" ? null : resolve(pageUrl)]
  return [...new Set(candidates.filter(Predicate.isNotNull).filter((url) => url !== ""))]
}

/** The single character shown in place of a favicon that can't be shown. */
export const faviconLetter = (pageUrl: string, title: string): string => {
  const source = Option.getOrElse(hostOf(pageUrl), () => title).replace(/^www\./, "")
  return source.trim().charAt(0).toUpperCase() || "・"
}
