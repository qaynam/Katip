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

export type CandidateKind = "OpenTab" | "Pin" | "Space" | "Bookmark"

export interface SearchCandidate {
  readonly kind: CandidateKind
  readonly title: string
  /** 空文字は URL を持たない候補（Space）。 */
  readonly url: string
  /** 最後に使った時刻（エポックミリ秒）。 */
  readonly lastUsedAt: Option.Option<number>
  /** 呼び出し元のウィンドウで今表示しているタブ。 */
  readonly isCurrent: boolean
}

export type SpotlightEntry<C> =
  | { readonly _tag: "Candidate"; readonly candidate: C }
  | { readonly _tag: "OpenUrl"; readonly url: string }
  | { readonly _tag: "SearchWeb"; readonly query: string }

export interface SpotlightSearchOptions {
  readonly now: number
  /** 候補の最大件数。URL を開く項目とウェブ検索の項目は数えない。 */
  readonly limit: number
}

const strengthScore: Record<MatchStrength, number> = {
  Exact: 100,
  Prefix: 80,
  WordStart: 60,
  Substring: 40,
}

// URL での一致は、タイトルでの一段弱い一致と同じ重みにする。URL には同じサイトのホスト名が
// 繰り返し現れるので、タイトルと同じ重みにすると、タイトルに関係なく同じサイトのページが上位を占める
const URL_MATCH_DISCOUNT = 20

// 種類と最近使ったことによる加点は、合わせても一致の強さ 1 段分（20）に届かないようにする。
// 届くと、打った語との一致よりも開いた時刻で並びが決まり、絞り込むほど結果が読めなくなる
const kindBonus: Record<CandidateKind, number> = { OpenTab: 3, Pin: 2, Space: 2, Bookmark: 0 }
const RECENCY_BONUS_MAX = 10
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000

const recencyBonus = (lastUsedAt: Option.Option<number>, now: number): number =>
  Option.match(lastUsedAt, {
    onNone: () => 0,
    onSome: (usedAt) =>
      RECENCY_BONUS_MAX * 0.5 ** (Math.max(now - usedAt, 0) / RECENCY_HALF_LIFE_MS),
  })

interface SearchableText {
  readonly title: string
  readonly url: string
}

const urlMatchStrength = (url: string, term: string): Option.Option<MatchStrength> => {
  const urlTerm = searchableUrl(term)
  return url === "" || urlTerm === "" ? Option.none() : matchStrength(url, urlTerm)
}

const textScore = (text: SearchableText, term: string): Option.Option<number> =>
  pipe(
    [
      Option.map(matchStrength(text.title, term), (strength) => strengthScore[strength]),
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
  const text = { title: searchableTitle(candidate.title), url: searchableUrl(candidate.url) }
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

/**
 * Spotlight に並べる項目を、上から表示する順に返す。
 *
 * @remarks
 * 入力が空なら、開いているタブ（今表示しているものを除く）を最近使った順に並べ、Space を続ける。
 * 上限に収まらないときは Space を残し、使ったのが古いタブから省く。
 * 入力があれば、すべての語がタイトルか URL に含まれる候補を一致の強さの順に並べ、
 * 最後に入力でウェブを検索する項目を付ける。入力が URL らしければ、それを開く項目も加える。
 */
export const searchSpotlight = <C extends SearchCandidate>(
  input: string,
  candidates: ReadonlyArray<C>,
  options: SpotlightSearchOptions,
): ReadonlyArray<SpotlightEntry<C>> => {
  const asEntries = (ranked: ReadonlyArray<C>): ReadonlyArray<SpotlightEntry<C>> =>
    ranked.slice(0, options.limit).map((candidate) => ({ _tag: "Candidate", candidate }))
  const terms = searchTerms(input)
  if (!Array.isReadonlyArrayNonEmpty(terms)) {
    return asEntries(suggestionsWithoutQuery(candidates, options.limit))
  }

  const matches = asEntries(rankMatches(candidates, terms, searchPhrase(input), options.now))
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
