import { Array, Number, Option, Order, pipe } from "effect"
import {
  type MatchStrength,
  matchStrength,
  searchableTitle,
  searchableUrl,
  searchPhrase,
  searchTerms,
} from "./search-text"
import { urlFromInput } from "./url-input"

export type CandidateKind = "OpenTab" | "Pin" | "Space" | "Bookmark" | "History" | "Action"

/**
 * `All` searches candidates of every kind. `Actions` searches only the action (`Action`)
 * candidates.
 */
export type SpotlightSearchMode = "All" | "Actions"

export interface SearchCandidate {
  readonly kind: CandidateKind
  readonly title: string
  /**
   * Other names matched the same way as the title, such as an action's name in a language other
   * than the one shown. A match on one of them still shows `title`.
   */
  readonly keywords?: ReadonlyArray<string>
  /** Empty for a candidate without a URL (a Space). */
  readonly url: string
  /** When it was last used, in epoch milliseconds. */
  readonly lastUsedAt: Option.Option<number>
  /** Whether it is the tab currently shown in the window Spotlight was opened from. */
  readonly isCurrent: boolean
}

export type SpotlightEntry<C> =
  | { readonly _tag: "Candidate"; readonly candidate: C }
  | { readonly _tag: "OpenUrl"; readonly url: string }
  | { readonly _tag: "SearchWeb"; readonly query: string }

export interface SpotlightSearchOptions {
  readonly mode: SpotlightSearchMode
  readonly now: number
  /** The most candidates to return. The open-URL and web search entries don't count toward it. */
  readonly limit: number
}

const strengthScore: Record<MatchStrength, number> = {
  Exact: 100,
  Prefix: 80,
  WordStart: 60,
  Substring: 40,
}

// A URL match weighs the same as a title match one strength lower. Not the same weight as the
// title: the same site's host name recurs across URLs, so that site's pages would take the top
// whatever their titles
const URL_MATCH_DISCOUNT = 20

// The bonuses for kind and recent use together stay below one step of match strength (20).
// Reaching it would let when a page was opened outrank how well it matches what was typed, and
// narrowing the search would make the results harder to predict
const kindBonus: Record<CandidateKind, number> = {
  OpenTab: 4,
  Pin: 3,
  Space: 3,
  Action: 2,
  Bookmark: 1,
  History: 0,
}
const RECENCY_BONUS_MAX = 10
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000

const recencyBonus = (lastUsedAt: Option.Option<number>, now: number): number =>
  Option.match(lastUsedAt, {
    onNone: () => 0,
    onSome: (usedAt) =>
      RECENCY_BONUS_MAX * 0.5 ** (Math.max(now - usedAt, 0) / RECENCY_HALF_LIFE_MS),
  })

interface SearchableText {
  /** The title, and the other names matched the same way as the title. */
  readonly titles: ReadonlyArray<string>
  readonly url: string
}

const urlMatchStrength = (url: string, term: string): Option.Option<MatchStrength> => {
  const urlTerm = searchableUrl(term)
  return url === "" || urlTerm === "" ? Option.none() : matchStrength(url, urlTerm)
}

const textScore = (text: SearchableText, term: string): Option.Option<number> =>
  pipe(
    [
      ...text.titles.map((title) =>
        Option.map(matchStrength(title, term), (strength) => strengthScore[strength]),
      ),
      Option.map(
        urlMatchStrength(text.url, term),
        (strength) => strengthScore[strength] - URL_MATCH_DISCOUNT,
      ),
    ],
    Array.getSomes,
    Array.match({
      onEmpty: () => Option.none(),
      onNonEmpty: (scores) => Option.some(Math.max(...scores)),
    }),
  )

const matchScore = (
  candidate: SearchCandidate,
  terms: Array.NonEmptyReadonlyArray<string>,
  phrase: string,
): Option.Option<number> => {
  const text = {
    titles: [candidate.title, ...(candidate.keywords ?? [])].map(searchableTitle),
    url: searchableUrl(candidate.url),
  }
  const termScores = Option.all(terms.map((term) => textScore(text, term)))
  const phraseBonus = terms.length > 1 ? Option.getOrElse(textScore(text, phrase), () => 0) : 0
  return Option.map(termScores, (scores) => Number.sumAll(scores) + phraseBonus)
}

const byRecentUse = Order.flip(
  Order.mapInput(
    Option.makeOrder(Order.Number),
    (candidate: SearchCandidate) => candidate.lastUsedAt,
  ),
)

const suggestionsWithoutQuery = <C extends SearchCandidate>(
  candidates: ReadonlyArray<C>,
  limit: number,
): ReadonlyArray<C> => {
  const spaces = candidates.filter((candidate) => candidate.kind === "Space").slice(0, limit)
  const recentTabs = Array.sort(
    candidates.filter((candidate) => candidate.kind === "OpenTab" && !candidate.isCurrent),
    byRecentUse,
  )
  return [...recentTabs.slice(0, limit - spaces.length), ...spaces]
}

const byScoreDescending = Order.flip(
  Order.mapInput(Order.Number, ([, score]: readonly [unknown, number]) => score),
)

const rankMatches = <C extends SearchCandidate>(
  candidates: ReadonlyArray<C>,
  terms: Array.NonEmptyReadonlyArray<string>,
  phrase: string,
  now: number,
): ReadonlyArray<C> =>
  pipe(
    candidates.map((candidate) =>
      Option.map(
        matchScore(candidate, terms, phrase),
        (score) =>
          [
            candidate,
            score + kindBonus[candidate.kind] + recencyBonus(candidate.lastUsedAt, now),
          ] as const,
      ),
    ),
    Array.getSomes,
    Array.sort(byScoreDescending),
    Array.map(([candidate]) => candidate),
  )

const asEntries = <C>(ranked: ReadonlyArray<C>, limit: number): ReadonlyArray<SpotlightEntry<C>> =>
  ranked.slice(0, limit).map((candidate) => ({ _tag: "Candidate", candidate }))

const searchActions = <C extends SearchCandidate>(
  input: string,
  candidates: ReadonlyArray<C>,
  options: SpotlightSearchOptions,
): ReadonlyArray<SpotlightEntry<C>> => {
  const actions = candidates.filter((candidate) => candidate.kind === "Action")
  const terms = searchTerms(input)
  return asEntries(
    Array.isReadonlyArrayNonEmpty(terms)
      ? rankMatches(actions, terms, searchPhrase(input), options.now)
      : actions,
    options.limit,
  )
}

/**
 * Returns the entries to list in Spotlight, from top to bottom.
 *
 * @remarks
 * In `All` with an empty input, lists the open tabs (except the one currently shown) by most
 * recent use, followed by the Spaces. When they don't fit the limit, the Spaces stay and the least
 * recently used tabs are dropped.
 * With an input, lists the candidates whose title or URL contains every term, strongest match
 * first, and ends with an entry that searches the web for the input. When the input looks like a
 * URL, an entry that opens it is added too: first when the input spells out the scheme, otherwise
 * right after the candidates.
 *
 * In `Actions`, returns only the action candidates: all of them in the given order for an empty
 * input, otherwise the matching ones, strongest match first. No open-URL or web search entry is
 * added.
 */
export const searchSpotlight = <C extends SearchCandidate>(
  input: string,
  candidates: ReadonlyArray<C>,
  options: SpotlightSearchOptions,
): ReadonlyArray<SpotlightEntry<C>> => {
  if (options.mode === "Actions") return searchActions(input, candidates, options)
  const terms = searchTerms(input)
  if (!Array.isReadonlyArrayNonEmpty(terms)) {
    return asEntries(suggestionsWithoutQuery(candidates, options.limit), options.limit)
  }

  const matches = asEntries(
    rankMatches(candidates, terms, searchPhrase(input), options.now),
    options.limit,
  )
  const openUrl = Option.map(urlFromInput(input), ({ url, hasScheme }) => ({
    hasScheme,
    entry: { _tag: "OpenUrl", url } as const,
  }))
  const openUrlFirst = Option.filter(openUrl, ({ hasScheme }) => hasScheme)
  const openUrlLast = Option.filter(openUrl, ({ hasScheme }) => !hasScheme)
  return [
    ...Option.toArray(openUrlFirst).map(({ entry }) => entry),
    ...matches,
    ...Option.toArray(openUrlLast).map(({ entry }) => entry),
    { _tag: "SearchWeb", query: input.trim() },
  ]
}
