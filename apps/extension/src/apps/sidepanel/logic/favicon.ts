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

/**
 * How an icon reads against a background: one shape all light, one shape all dark, or anything
 * else, such as a colorful icon or one with a backdrop of its own.
 */
export type FaviconTone = "Light" | "Dark" | "Mixed"

const OPAQUE_ALPHA = 128
// A pixel whose channels spread this far apart is colored, not a shade of gray
const GRAY_CHROMA_MAX = 48
const LIGHT_MIN = 0.7
const DARK_MAX = 0.3
// Edges smoothed against the background are neither light nor dark, so not every pixel need be
const SHARE_OF_ONE_TONE = 0.9
const SHARE_OF_COLORED_MAX = 0.1
// An icon showing almost nothing has no tone worth correcting
const SHARE_OF_OPAQUE_MIN = 0.05

/** The tone of an icon from its pixels, as RGBA bytes in rows. */
export const faviconToneOf = (rgba: ArrayLike<number>): FaviconTone => {
  const pixelCount = Math.floor(rgba.length / 4)
  let opaque = 0
  let colored = 0
  let light = 0
  let dark = 0
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    const red = rgba[offset] ?? 0
    const green = rgba[offset + 1] ?? 0
    const blue = rgba[offset + 2] ?? 0
    const alpha = rgba[offset + 3] ?? 0
    if (alpha < OPAQUE_ALPHA) continue
    opaque += 1
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > GRAY_CHROMA_MAX) colored += 1
    const lightness = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    if (lightness >= LIGHT_MIN) light += 1
    else if (lightness <= DARK_MAX) dark += 1
  }
  if (opaque < pixelCount * SHARE_OF_OPAQUE_MIN || colored > opaque * SHARE_OF_COLORED_MAX) {
    return "Mixed"
  }
  if (light >= opaque * SHARE_OF_ONE_TONE) return "Light"
  return dark >= opaque * SHARE_OF_ONE_TONE ? "Dark" : "Mixed"
}

const isReadableByPage = (url: string) =>
  url.startsWith("chrome-extension:") || url.startsWith("data:")

/**
 * Where to read the pixels of the icon shown from `source`: the icon itself when the side panel may
 * read it, otherwise the browser's saved favicon of the page, which is most often the same image.
 * Null when neither can be read.
 */
export const toneSampleUrl = (
  source: string,
  pageUrl: string,
  resolve: FaviconResolver,
): string | null => {
  if (isReadableByPage(source)) return source
  const saved = pageUrl === "" ? null : resolve(pageUrl)
  return saved !== null && isReadableByPage(saved) ? saved : null
}
