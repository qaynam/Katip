// Ported from node-asearch by Sho Hashimoto, under the BSD 2-Clause license in LICENSE beside
// this file. Kept as close to it as the language allows, so the two can be compared line by line

const INITPAT = 0x80000000
const MAXCHAR = 0x10000
const INITSTATE: readonly [number, number, number, number] = [INITPAT, 0, 0, 0]

const isupper = (c: number): boolean => c >= 0x41 && c <= 0x5a
const islower = (c: number): boolean => c >= 0x61 && c <= 0x7a
const tolower = (c: number): number => (isupper(c) ? c + 0x20 : c)
const toupper = (c: number): number => (islower(c) ? c - 0x20 : c)

const unpack = (str: string): Array<number> => {
  const bytes: Array<number> = []
  for (const c of str.split("")) bytes.push(c.charCodeAt(0))
  return bytes
}

/**
 * The most errors {@link asearch}'s matcher tells apart. A larger allowance counts as this many.
 */
export const MAX_AMBIGUITY = 3

/**
 * The most characters other than spaces a pattern can hold. A pattern longer than this matches
 * nothing.
 */
export const MAX_PATTERN_LENGTH = 31

/**
 * Whether `text` is `pattern` give or take `ambiguity` errors, each an inserted, deleted or
 * replaced character.
 */
export type AsearchMatcher = (text: string, ambiguity?: number) => boolean

/**
 * A matcher for approximate matches of `source`, the bit-parallel algorithm Toshiyuki Masui
 * designed.
 *
 * @remarks
 * The whole of the text has to match, not a part of it. A space in `source` stands for any run of
 * characters, none included, so `" term "` finds the term anywhere in the text. Letters A to Z
 * match either case; every other character, Japanese among them, matches only itself.
 */
export const asearch = (source: string): AsearchMatcher => {
  const shiftpat: Array<number> = new Array<number>(MAXCHAR).fill(0)
  let epsilon = 0
  let mask = INITPAT
  for (const i of unpack(source)) {
    if (i === 0x20) {
      epsilon |= mask
    } else {
      shiftpat[i] = (shiftpat[i] ?? 0) | mask
      shiftpat[toupper(i)] = (shiftpat[toupper(i)] ?? 0) | mask
      shiftpat[tolower(i)] = (shiftpat[tolower(i)] ?? 0) | mask
      mask = mask >>> 1
    }
  }
  const acceptpat = mask

  const getState = (
    state: readonly [number, number, number, number],
    str: string,
  ): [number, number, number, number] => {
    let i0 = state[0]
    let i1 = state[1]
    let i2 = state[2]
    let i3 = state[3]
    for (const c of unpack(str)) {
      const m = shiftpat[c] ?? 0
      i3 = (i3 & epsilon) | ((i3 & m) >>> 1) | (i2 >>> 1) | i2
      i2 = (i2 & epsilon) | ((i2 & m) >>> 1) | (i1 >>> 1) | i1
      i1 = (i1 & epsilon) | ((i1 & m) >>> 1) | (i0 >>> 1) | i0
      i0 = (i0 & epsilon) | ((i0 & m) >>> 1)
      i1 |= i0 >>> 1
      i2 |= i1 >>> 1
      i3 |= i2 >>> 1
    }
    return [i0, i1, i2, i3]
  }

  return (text, ambiguity = 0) => {
    const state = getState(INITSTATE, text)
    const a = Math.max(0, Math.min(ambiguity, MAX_AMBIGUITY))
    return ((state[a] ?? 0) & acceptpat) !== 0
  }
}
