import { Array, Option, pipe } from "effect"

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

/** How strongly the term `term` matches `text`, both already made ready for matching. */
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
