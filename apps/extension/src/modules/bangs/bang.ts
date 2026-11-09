import type { Array } from "effect"

/** How a bang's URL is filled in, after the format flags of Kagi's list. */
export interface BangFormat {
  /** With nothing to search for, opens the top page of the site instead of its search page. */
  readonly opensTopPageWithoutQuery: boolean
  /** Percent-encodes the search terms. Off for the few sites that expect them as typed. */
  readonly encodesQuery: boolean
  /** Encodes a space as `+` rather than `%20`. */
  readonly encodesSpaceAsPlus: boolean
}

/** What Kagi's list does for a bang that sets no flags: everything on. */
export const DEFAULT_BANG_FORMAT: BangFormat = {
  opensTopPageWithoutQuery: true,
  encodesQuery: true,
  encodesSpaceAsPlus: true,
}

// The bits Helium gives each of Kagi's format flags. Bit 2, opening an alternative domain, is
// left out: Helium's list drops the domain it would open
const OPEN_BASE_PATH = 1 << 0
const URL_ENCODE_PLACEHOLDER = 1 << 2
const URL_ENCODE_SPACE_TO_PLUS = 1 << 3

/**
 * The format a bang's flags in Helium's list stand for. A bang without flags gets
 * {@link DEFAULT_BANG_FORMAT}; one with flags gets only the flags it sets.
 */
export const formatOfFlags = (flags: number | undefined): BangFormat =>
  flags === undefined
    ? DEFAULT_BANG_FORMAT
    : {
        opensTopPageWithoutQuery: (flags & OPEN_BASE_PATH) !== 0,
        encodesQuery: (flags & URL_ENCODE_PLACEHOLDER) !== 0,
        encodesSpaceAsPlus: (flags & URL_ENCODE_SPACE_TO_PLUS) !== 0,
      }

/**
 * A shortcut for searching a site: typing `!gh katip` searches GitHub for "katip".
 */
export interface Bang {
  /** The site's name, such as "GitHub". */
  readonly name: string
  /** What follows `!` to use the bang, lowercase, the shortest first. */
  readonly triggers: Array.NonEmptyReadonlyArray<string>
  /** The URL to open, with `%s` where the search terms go. A URL without `%s` opens as it is. */
  readonly template: string
  readonly format: BangFormat
}
