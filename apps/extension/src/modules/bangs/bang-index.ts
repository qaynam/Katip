import { Array, Option, Order } from "effect"
import type { Bang } from "./bang"

export interface BangMatch {
  readonly bang: Bang
  /** The trigger of the bang that matched. */
  readonly trigger: string
}

export interface BangIndex {
  /** The bang a trigger stands for. */
  readonly find: (trigger: string) => Option.Option<Bang>
  /** Every trigger starting with `prefix`, with its bang, in no particular order. */
  readonly triggersStartingWith: (prefix: string) => ReadonlyArray<BangMatch>
  /**
   * The bangs with a trigger starting with `prefix`, each listed once with its best matching
   * trigger: the exact trigger first, then shorter triggers before longer ones, and among triggers
   * of the same length, bangs with more triggers first.
   */
  readonly startingWith: (prefix: string, limit: number) => ReadonlyArray<BangMatch>
}

// The list says nothing of how often each bang is used. The number of triggers stands in for it:
// well-known sites gather aliases (YouTube has nine), while the long tail has one or two. In
// alphabetical order instead, !y suggested Y8 and Yandex ahead of YouTube
const byRelevanceTo = (prefix: string) =>
  Order.combineAll<BangMatch>([
    Order.mapInput(Order.Boolean, (match) => match.trigger !== prefix),
    Order.mapInput(Order.Number, (match) => match.trigger.length),
    Order.flip(Order.mapInput(Order.Number, (match) => match.bang.triggers.length)),
    Order.mapInput(Order.String, (match) => match.trigger),
  ])

// Sorting is stable, so of two equally good matches the one listed first stays first
const bestMatches = (
  matches: ReadonlyArray<BangMatch>,
  prefix: string,
  limit: number,
): ReadonlyArray<BangMatch> => {
  const seen = new Set<Bang>()
  return Array.sort(matches, byRelevanceTo(prefix))
    .filter((match) => {
      if (seen.has(match.bang)) return false
      seen.add(match.bang)
      return true
    })
    .slice(0, limit)
}

// The first index of a trigger not sorting before `prefix`. Every trigger starting with `prefix`
// follows from there, before any that doesn't
const firstAtOrAfter = (sorted: ReadonlyArray<string>, prefix: string): number => {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((sorted[middle] ?? "") < prefix) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Indexes bangs by their triggers. When bangs share a trigger, the one listed first has it.
 */
export const bangIndexOf = (bangs: ReadonlyArray<Bang>): BangIndex => {
  const byTrigger = new Map<string, Bang>()
  for (const bang of bangs) {
    for (const trigger of bang.triggers) if (!byTrigger.has(trigger)) byTrigger.set(trigger, bang)
  }
  const triggers = [...byTrigger.keys()].sort()
  const triggersStartingWith = (prefix: string): ReadonlyArray<BangMatch> => {
    const matches: Array<BangMatch> = []
    for (let at = firstAtOrAfter(triggers, prefix); at < triggers.length; at++) {
      const trigger = triggers[at] ?? ""
      const bang = byTrigger.get(trigger)
      if (!trigger.startsWith(prefix) || bang === undefined) break
      matches.push({ bang, trigger })
    }
    return matches
  }
  return {
    find: (trigger) => Option.fromNullishOr(byTrigger.get(trigger)),
    triggersStartingWith,
    startingWith: (prefix, limit) => bestMatches(triggersStartingWith(prefix), prefix, limit),
  }
}

/**
 * The bangs of `first` over those of `second`: a trigger in both stands for the bang in `first`,
 * which also comes first among equally good matches.
 */
export const layeredIndex = (first: BangIndex, second: BangIndex): BangIndex => {
  const triggersStartingWith = (prefix: string) => [
    ...first.triggersStartingWith(prefix),
    ...second
      .triggersStartingWith(prefix)
      .filter((match) => Option.isNone(first.find(match.trigger))),
  ]
  return {
    find: (trigger) => Option.orElse(first.find(trigger), () => second.find(trigger)),
    triggersStartingWith,
    startingWith: (prefix, limit) => bestMatches(triggersStartingWith(prefix), prefix, limit),
  }
}

export const emptyBangIndex: BangIndex = bangIndexOf([])
