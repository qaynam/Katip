import { Option } from "effect"

export interface BangRequest {
  /** What was written right after `!`, lowercase. */
  readonly trigger: string
  /** The other words of the input, joined by single spaces. */
  readonly query: string
}

const wordsOf = (input: string) => input.split(/\s+/).filter((word) => word !== "")

const isBangWord = (word: string) => word.length > 1 && word.startsWith("!")

/**
 * The bangs written in the input, in the order written: every word that starts with `!`, each with
 * the rest of the input as what it searches for. A bang can come before the query or after it, as
 * in `!gh katip` and `katip !gh`.
 */
export const bangRequestsIn = (input: string): ReadonlyArray<BangRequest> => {
  const words = wordsOf(input)
  return words.flatMap((word, index) =>
    isBangWord(word)
      ? [
          {
            trigger: word.slice(1).toLowerCase(),
            query: words.filter((_, other) => other !== index).join(" "),
          },
        ]
      : [],
  )
}

/**
 * The start of a trigger being typed, lowercase: what follows `!` when that is all the input holds
 * and no space has been typed after it yet. Empty for `!` alone.
 */
export const triggerBeingTyped = (input: string): Option.Option<string> => {
  const typing = /^!(\S*)$/.exec(input.trimStart())
  return typing === null ? Option.none() : Option.some((typing[1] ?? "").toLowerCase())
}

/** The input that sets up a search with the bang `trigger`, ready for the query to be typed. */
export const inputForTrigger = (trigger: string): string => `!${trigger} `
