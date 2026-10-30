import { Array, Option, pipe } from "effect"

export type MatchStrength = "Exact" | "Prefix" | "WordStart" | "Substring"

const normalize = (text: string): string =>
  text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()

/** 入力を空白で区切った、照合用の語。空白だけの入力なら空。 */
export const searchTerms = (input: string): ReadonlyArray<string> =>
  normalize(input)
    .split(" ")
    .filter((term) => term.length > 0)

/** 照合用に整えた入力全体。語に区切らない。 */
export const searchPhrase = (input: string): string => normalize(input)

export const searchableTitle = (title: string): string => normalize(title)

// 利用者は scheme や www. を打たずにホスト名から打ち始めるので、照合の前に外しておく
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

/** 照合用に整えた `text` に、照合用の語 `term` がどれだけ強く一致するか。 */
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
