import { Option, Predicate } from "effect"
import { hostOf } from "./view-queries"

/** Builds a favicon image URL from a page URL. Returns null where that isn't possible. */
export type FaviconResolver = (pageUrl: string) => string | null

export const noFaviconResolver: FaviconResolver = () => null

// The tab's own favicon comes first because it can be fresher than the cache when it changes
// dynamically (unread counts and so on). Closed pins have no tab, so they can only resolve from
// the page URL
export const faviconCandidates = (
  pageUrl: string,
  favIconUrl: string | null,
  resolve: FaviconResolver,
): ReadonlyArray<string> => {
  const candidates = [favIconUrl, pageUrl === "" ? null : resolve(pageUrl)]
  return [...new Set(candidates.filter(Predicate.isNotNull).filter((url) => url !== ""))]
}

export const faviconLetter = (pageUrl: string, title: string): string => {
  const source = Option.getOrElse(hostOf(pageUrl), () => title).replace(/^www\./, "")
  return source.trim().charAt(0).toUpperCase() || "・"
}
