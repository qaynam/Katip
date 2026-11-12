import { describe, expect, it } from "vitest"
import { asearch, MAX_PATTERN_LENGTH } from "./asearch"

describe("asearch", () => {
  it("with no errors allowed, matches only the pattern itself", () => {
    const matches = asearch("abc")

    expect([matches("abc", 0), matches("abd", 0)]).toStrictEqual([true, false])
  })

  it("matches the whole text, not a part of it, however many errors are allowed", () => {
    expect(asearch("abc")("xxabcyy", 3)).toBe(false)
  })

  it("with one error allowed, matches a text with one character replaced", () => {
    const matches = asearch("abcd")

    expect([matches("abXd", 0), matches("abXd", 1)]).toStrictEqual([false, true])
  })

  it("with one error allowed, matches a text with one character added or left out", () => {
    const matches = asearch("abcd")

    expect([matches("abcXd", 1), matches("acd", 1)]).toStrictEqual([true, true])
  })

  it("matches a text with two errors only when two are allowed", () => {
    const matches = asearch("abcd")

    expect([matches("aXXd", 1), matches("aXXd", 2)]).toStrictEqual([false, true])
  })

  it("misses a text further off than the errors allowed", () => {
    expect(asearch("abcd")("XXXX", 2)).toBe(false)
  })

  it("matches letters A to Z in either case", () => {
    expect(asearch("abc")("ABC", 0)).toBe(true)
  })

  it("matches Japanese, with a mistyped character as one error", () => {
    const matches = asearch("検索")

    expect([matches("検索", 0), matches("検素", 0), matches("検素", 1)]).toStrictEqual([
      true,
      false,
      true,
    ])
  })

  it("misses an unrelated Japanese text even with two errors allowed", () => {
    expect(asearch("検索エンジン")("全然違う文字列", 2)).toBe(false)
  })

  it("takes a space in the pattern for any run of characters, none included", () => {
    const matches = asearch("a b")

    expect([matches("axb", 0), matches("ab", 0)]).toStrictEqual([true, true])
  })

  it("with spaces around the pattern, finds it anywhere in the text", () => {
    expect(asearch(" abc ")("xxabcyy", 0)).toBe(true)
  })

  it("counts more errors allowed than it tells apart as the most it does", () => {
    expect(asearch("abcdefgh")("aXXXefgh", 9)).toBe(true)
  })

  it("matches nothing with a pattern longer than it can hold", () => {
    const long = "a".repeat(MAX_PATTERN_LENGTH + 1)

    expect(asearch(long)(long, 0)).toBe(false)
  })
})
