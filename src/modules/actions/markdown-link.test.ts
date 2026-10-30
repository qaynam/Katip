import { describe, expect, it } from "vitest"
import { markdownLinkOf } from "./markdown-link"

describe("markdownLinkOf", () => {
  it("タイトルを文字列、URL をリンク先にした Markdown のリンクにする", () => {
    expect(markdownLinkOf({ title: "Katip", url: "https://example.com/" })).toBe(
      "[Katip](https://example.com/)",
    )
  })

  it("タイトルの角括弧とバックスラッシュは、リンクの区切りと読まれないようエスケープする", () => {
    expect(markdownLinkOf({ title: "[WIP] a\\b", url: "https://example.com/" })).toBe(
      "[\\[WIP\\] a\\\\b](https://example.com/)",
    )
  })

  it("URL の丸括弧と空白は、リンク先の終わりと読まれないようパーセントエンコードする", () => {
    expect(markdownLinkOf({ title: "Wiki", url: "https://example.com/Foo_(bar) baz" })).toBe(
      "[Wiki](https://example.com/Foo_%28bar%29%20baz)",
    )
  })

  it("タイトルが空なら、URL をそのまま文字列にする", () => {
    expect(markdownLinkOf({ title: "  ", url: "https://example.com/" })).toBe(
      "[https://example.com/](https://example.com/)",
    )
  })
})
