import { Array, Option } from "effect"
import type { Bang } from "./bang"
import type { BangIndex, BangMatch } from "./bang-index"
import { bangRequestsIn, triggerBeingTyped } from "./bang-input"
import { bangUrl } from "./bang-url"

export interface BangSearch {
  readonly bang: Bang
  /** What the bang searches for; empty when nothing was typed besides it. */
  readonly query: string
  /** The page to open. */
  readonly url: string
}

/** The site search the input asks for: the first bang written in it that the index knows. */
export const bangSearchIn = (input: string, index: BangIndex): Option.Option<BangSearch> =>
  Array.findFirst(bangRequestsIn(input), ({ trigger, query }) =>
    Option.map(index.find(trigger), (bang) => ({ bang, query, url: bangUrl(bang, query) })),
  )

/**
 * The bangs the trigger being typed can become, best match first. None until at least one
 * character follows the `!`: every bang would match `!` alone.
 */
export const bangSuggestionsFor = (
  input: string,
  index: BangIndex,
  limit: number,
): ReadonlyArray<BangMatch> =>
  Option.match(
    Option.filter(triggerBeingTyped(input), (prefix) => prefix !== ""),
    { onNone: () => [], onSome: (prefix) => index.startingWith(prefix, limit) },
  )
