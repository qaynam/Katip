import { describe, expect, it } from "vitest"
import { checkDraft, type SiteCommandDraft } from "./site-command"

const draft = (fields: Partial<SiteCommandDraft>): SiteCommandDraft => ({
  title: "New Linear Issue",
  url: "https://linear.new",
  keyword: "",
  ...fields,
})

const noKeywords = new Set<string>()

describe("checking a command typed into the settings", () => {
  it("accepts a title and a page to open, with no keyword", () => {
    expect(checkDraft(draft({}), noKeywords)).toStrictEqual({
      _tag: "Valid",
      fields: { title: "New Linear Issue", url: "https://linear.new", keyword: null },
    })
  })

  it("trims the fields, adds https:// to a URL typed without a scheme and tidies the keyword", () => {
    const checked = checkDraft(
      draft({ title: "  Search Linear ", url: " linear.app/search?q=%s ", keyword: " !LIN " }),
      noKeywords,
    )

    expect(checked).toStrictEqual({
      _tag: "Valid",
      fields: { title: "Search Linear", url: "https://linear.app/search?q=%s", keyword: "lin" },
    })
  })

  it("accepts the query in the host name", () => {
    expect(
      checkDraft(draft({ url: "https://%s.example.com/", keyword: "ex" }), noKeywords)._tag,
    ).toBe("Valid")
  })

  it("asks for a title", () => {
    expect(checkDraft(draft({ title: "   " }), noKeywords)).toStrictEqual({
      _tag: "Invalid",
      problems: ["TitleMissing"],
    })
  })

  it("refuses a missing URL and one that isn't a web page", () => {
    expect([
      checkDraft(draft({ url: "" }), noKeywords),
      checkDraft(draft({ url: "javascript:alert(1)" }), noKeywords),
      checkDraft(draft({ url: "https://exa mple.com" }), noKeywords),
    ]).toStrictEqual([
      { _tag: "Invalid", problems: ["UrlInvalid"] },
      { _tag: "Invalid", problems: ["UrlInvalid"] },
      { _tag: "Invalid", problems: ["UrlInvalid"] },
    ])
  })

  it("asks for a keyword when the command searches, since only its keyword can pass the query", () => {
    expect(checkDraft(draft({ url: "https://linear.app/search?q=%s" }), noKeywords)).toStrictEqual({
      _tag: "Invalid",
      problems: ["KeywordMissing"],
    })
  })

  it("refuses a keyword with a space in it", () => {
    expect(checkDraft(draft({ keyword: "my lin" }), noKeywords)).toStrictEqual({
      _tag: "Invalid",
      problems: ["KeywordInvalid"],
    })
  })

  it("refuses a keyword another command has", () => {
    expect(checkDraft(draft({ keyword: "Lin" }), new Set(["lin"]))).toStrictEqual({
      _tag: "Invalid",
      problems: ["KeywordTaken"],
    })
  })

  it("lists every problem at once", () => {
    expect(checkDraft({ title: "", url: "", keyword: "a b" }, noKeywords)).toStrictEqual({
      _tag: "Invalid",
      problems: ["TitleMissing", "UrlInvalid", "KeywordInvalid"],
    })
  })
})
