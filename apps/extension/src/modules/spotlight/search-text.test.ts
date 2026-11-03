import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { matchStrength, searchableTitle, searchableUrl, searchTerms } from "./search-text"

describe("search terms", () => {
  it("splits the input at whitespace", () => {
    expect(searchTerms("google  docs")).toStrictEqual(["google", "docs"])
  })

  it("a blank input has no terms", () => {
    expect(searchTerms("  \t ")).toStrictEqual([])
  })

  it("folds case, and full-width characters to their half-width forms", () => {
    expect(searchTerms("ＧｉｔＨｕｂ　Ｐｒ")).toStrictEqual(["github", "pr"])
  })
})

describe("searchable title", () => {
  it("folds case, and full-width characters to their half-width forms", () => {
    expect(searchableTitle("Ｋａｔｉｐ Design")).toBe("katip design")
  })
})

describe("searchable URL", () => {
  it("drops the scheme and a leading www.", () => {
    expect(searchableUrl("https://www.GitHub.com/effect")).toBe("github.com/effect")
  })

  it("a chrome:// page starts at the page name", () => {
    expect(searchableUrl("chrome://settings/")).toBe("settings/")
  })
})

describe("match strength", () => {
  it("is Exact when the whole text equals the term", () => {
    expect(matchStrength("katip", "katip")).toStrictEqual(Option.some("Exact"))
  })

  it("is Prefix when the text starts with the term", () => {
    expect(matchStrength("katip design", "kat")).toStrictEqual(Option.some("Prefix"))
  })

  it("is WordStart when a later word starts with the term", () => {
    expect(matchStrength("open katip design", "des")).toStrictEqual(Option.some("WordStart"))
  })

  it("treats the character after a symbol as the start of a word", () => {
    expect(matchStrength("github.com/effect-ts", "ts")).toStrictEqual(Option.some("WordStart"))
  })

  it("is Substring when the term only matches inside words", () => {
    expect(matchStrength("digital notes", "git")).toStrictEqual(Option.some("Substring"))
  })

  it("is the stronger WordStart when the term matches both inside a word and at the start of one", () => {
    expect(matchStrength("digital git", "git")).toStrictEqual(Option.some("WordStart"))
  })

  it("is Substring for a term inside Japanese text, which has no spaces between words", () => {
    expect(matchStrength("設計ドキュメント", "ドキュメント")).toStrictEqual(
      Option.some("Substring"),
    )
  })

  it("doesn't match when the text doesn't contain the term", () => {
    expect(matchStrength("katip", "mail")).toStrictEqual(Option.none())
  })

  it("doesn't match an empty text", () => {
    expect(matchStrength("", "a")).toStrictEqual(Option.none())
  })
})
