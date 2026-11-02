import { describe, expect, it } from "vitest"
import { markdownLinkOf } from "./markdown-link"

describe("markdownLinkOf", () => {
  it("makes a Markdown link with the title as its text and the URL as its destination", () => {
    expect(markdownLinkOf({ title: "Katip", url: "https://example.com/" })).toBe(
      "[Katip](https://example.com/)",
    )
  })

  it("escapes square brackets and backslashes in the title so they aren't read as link delimiters", () => {
    expect(markdownLinkOf({ title: "[WIP] a\\b", url: "https://example.com/" })).toBe(
      "[\\[WIP\\] a\\\\b](https://example.com/)",
    )
  })

  it("percent-encodes parentheses and whitespace in the URL so they aren't read as the end of the destination", () => {
    expect(markdownLinkOf({ title: "Wiki", url: "https://example.com/Foo_(bar) baz" })).toBe(
      "[Wiki](https://example.com/Foo_%28bar%29%20baz)",
    )
  })

  it("uses the URL as the text when the title is blank", () => {
    expect(markdownLinkOf({ title: "  ", url: "https://example.com/" })).toBe(
      "[https://example.com/](https://example.com/)",
    )
  })
})
