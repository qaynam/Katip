import { Array, Option, pipe } from "effect"
import { asearch, MAX_PATTERN_LENGTH } from "#modules/asearch"

export type MatchStrength = "Exact" | "Prefix" | "WordStart" | "Substring"

const normalize = (text: string): string =>
  text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()

/** The input split at whitespace into terms ready for matching. Empty for a blank input. */
export const searchTerms = (input: string): ReadonlyArray<string> =>
  normalize(input)
    .split(" ")
    .filter((term) => term.length > 0)

/** The whole input made ready for matching, without splitting it into terms. */
export const searchPhrase = (input: string): string => normalize(input)

export const searchableTitle = (title: string): string => normalize(title)

// People start typing at the host name, without the scheme or www., so those are stripped before
// matching
export const searchableUrl = (url: string): string =>
  normalize(url)
    .replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/, "")
    .replace(/^www\./, "")

const isWordCharacter = (character: string) => /[\p{L}\p{N}]/u.test(character)

const occurrencesOf = (text: string, term: string): ReadonlyArray<number> =>
  Array.unfold(text.indexOf(term), (index) =>
    index === -1 ? Option.none() : Option.some([index, text.indexOf(term, index + 1)] as const),
  )

const isWordStart = (text: string, index: number) =>
  index === 0 || !isWordCharacter(text.charAt(index - 1))

/**
 * How strongly the term `term` matches `text`, both already made ready for matching, short of a
 * typo: see {@link typoMatcherFor} for that.
 */
export const matchStrength = (text: string, term: string): Option.Option<MatchStrength> => {
  if (text === term) return Option.some("Exact")
  if (text.startsWith(term)) return Option.some("Prefix")
  return pipe(
    occurrencesOf(text, term),
    Array.match({
      onEmpty: () => Option.none(),
      onNonEmpty: (indexes) =>
        Option.some(indexes.some((index) => isWordStart(text, index)) ? "WordStart" : "Substring"),
    }),
  )
}

// Off by one character, a term of three or fewer is found in most texts: "tab" would match any
// word with "ta", "ab" or "tb" in it
const typosAllowedIn = (term: string): number => {
  if (term.length < 4) return 0
  if (term.length < 6) return 1
  return term.length < 10 ? 2 : 3
}

// Japanese and Chinese run their words together, so any of their characters may start one
const startsWordsUnspaced = (character: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)

const typoMatchStartsIn = (text: string): ReadonlyArray<number> =>
  Array.range(0, text.length - 1).filter(
    (index) =>
      (isWordStart(text, index) && isWordCharacter(text.charAt(index))) ||
      startsWordsUnspaced(text.charAt(index)),
  )

/**
 * Whether a text, made ready for matching, holds the term `term` at the start of one of its words,
 * give or take a few mistyped, missing, extra or swapped characters: one in a term of 4 or 5
 * characters, two up to 9, three beyond. None for a term too short for that, or too long for the
 * approximate search to hold.
 *
 * @remarks
 * Not anywhere in a word: forgiving a typo or two there, "linear" would already be found in
 * "calendar".
 */
export const typoMatcherFor = (term: string): Option.Option<(text: string) => boolean> => {
  const typos = typosAllowedIn(term)
  if (typos === 0 || term.length > MAX_PATTERN_LENGTH) return Option.none()
  // The space after the term lets the rest of the text follow it, and the one before lets anything
  // come first. Most texts hold the term nowhere, which one pass over the whole text tells, sparing
  // a try at every word
  const fromStart = asearch(`${term} `)
  const anywhere = asearch(` ${term} `)
  return Option.some(
    (text) =>
      anywhere(text, typos) &&
      typoMatchStartsIn(text).some((index) => fromStart(text.slice(index), typos)),
  )
}
