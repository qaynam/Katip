import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { matchStrength, searchableTitle, searchableUrl, searchTerms } from "./search-text"

describe("検索語の区切り", () => {
  it("空白で区切った語に分ける", () => {
    expect(searchTerms("google  docs")).toStrictEqual(["google", "docs"])
  })

  it("前後の空白だけの入力は語を持たない", () => {
    expect(searchTerms("  \t ")).toStrictEqual([])
  })

  it("大文字小文字と全角半角の違いをなくす", () => {
    expect(searchTerms("ＧｉｔＨｕｂ　Ｐｒ")).toStrictEqual(["github", "pr"])
  })
})

describe("照合用のタイトル", () => {
  it("大文字小文字と全角半角の違いをなくす", () => {
    expect(searchableTitle("Ｋａｔｉｐ Design")).toBe("katip design")
  })
})

describe("照合用の URL", () => {
  it("scheme と先頭の www. を除く", () => {
    expect(searchableUrl("https://www.GitHub.com/effect")).toBe("github.com/effect")
  })

  it("chrome:// のページはページ名から始まる", () => {
    expect(searchableUrl("chrome://settings/")).toBe("settings/")
  })
})

describe("一致の強さ", () => {
  it("全体が等しければ完全一致", () => {
    expect(matchStrength("katip", "katip")).toStrictEqual(Option.some("Exact"))
  })

  it("先頭から一致すれば前方一致", () => {
    expect(matchStrength("katip design", "kat")).toStrictEqual(Option.some("Prefix"))
  })

  it("途中の単語の先頭から一致すれば単語の先頭一致", () => {
    expect(matchStrength("open katip design", "des")).toStrictEqual(Option.some("WordStart"))
  })

  it("記号の直後も単語の先頭とみなす", () => {
    expect(matchStrength("github.com/effect-ts", "ts")).toStrictEqual(Option.some("WordStart"))
  })

  it("単語の途中にだけ一致すれば部分一致", () => {
    expect(matchStrength("digital notes", "git")).toStrictEqual(Option.some("Substring"))
  })

  it("単語の途中と先頭の両方に一致すれば、強いほうの単語の先頭一致", () => {
    expect(matchStrength("digital git", "git")).toStrictEqual(Option.some("WordStart"))
  })

  it("日本語の文中に含まれれば部分一致", () => {
    expect(matchStrength("設計ドキュメント", "ドキュメント")).toStrictEqual(
      Option.some("Substring"),
    )
  })

  it("含まれなければ一致しない", () => {
    expect(matchStrength("katip", "arc")).toStrictEqual(Option.none())
  })

  it("空の文字列には一致しない", () => {
    expect(matchStrength("", "a")).toStrictEqual(Option.none())
  })
})
