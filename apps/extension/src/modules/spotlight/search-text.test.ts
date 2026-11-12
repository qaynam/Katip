import { describe, expect, it } from "vitest"
import { Option } from "effect"
import {
  matchStrength,
  searchableTitle,
  searchableUrl,
  searchTerms,
  typoMatcherFor,
} from "./search-text"

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

describe("typo matcher", () => {
  const findsIn = (term: string, text: string) =>
    Option.exists(typoMatcherFor(term), (matches) => matches(text))

  it("for a term of 4 or 5 characters, forgives one typo but not two", () => {
    expect([findsIn("notes", "my nodes"), findsIn("notes", "my nodas")]).toStrictEqual([
      true,
      false,
    ])
  })

  it("for a term of 6 to 9 characters, forgives two typos but not three", () => {
    expect([findsIn("chatgpt", "chatgtp"), findsIn("chatgpt", "chtagtp")]).toStrictEqual([
      true,
      false,
    ])
  })

  it("for a term of 10 characters or more, forgives three typos", () => {
    expect(findsIn("javascript", "jvaascrxpt")).toBe(true)
  })

  it("finds the term only from the start of a word, not inside one", () => {
    expect([
      findsIn("linear", "new linaer issue"),
      findsIn("linear", "new calendar event"),
    ]).toStrictEqual([true, false])
  })

  it("finds a Japanese term from any of its characters, words being unspaced there", () => {
    expect(findsIn("検索エンジン", "全文検素エンジンの比較")).toBe(true)
  })

  it("is none for a term of three characters or fewer", () => {
    expect(Option.isNone(typoMatcherFor("tab"))).toBe(true)
  })

  it("is none for a term longer than the approximate search holds", () => {
    expect(Option.isNone(typoMatcherFor("a".repeat(32)))).toBe(true)
  })
})
