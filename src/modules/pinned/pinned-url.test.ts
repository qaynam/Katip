import { describe, expect, it } from "vitest"
import { hasNavigatedAway } from "./pinned-url"

describe("ピン留めした URL と同じページにいるとき", () => {
  it("URL が完全に同じなら移動していない", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/docs")).toBe(false)
  })

  it("クエリだけが違っても移動していない", () => {
    expect(
      hasNavigatedAway(
        "https://docs.example.com/d/1/edit",
        "https://docs.example.com/d/1/edit?tab=t.0",
      ),
    ).toBe(false)
  })

  it("ハッシュだけが違っても移動していない", () => {
    expect(
      hasNavigatedAway("https://example.com/docs#intro", "https://example.com/docs#usage"),
    ).toBe(false)
  })

  it("既定のポート番号の有無やホスト名の大文字小文字は同じ場所とみなす", () => {
    expect(hasNavigatedAway("https://Example.com:443/docs", "https://example.com/docs")).toBe(false)
  })

  it("ルートの末尾のスラッシュの有無は同じ場所とみなす", () => {
    expect(hasNavigatedAway("https://example.com", "https://example.com/")).toBe(false)
  })
})

describe("ピン留めした URL から別のページへ移ったとき", () => {
  it("パスが違えば移動した", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/blog")).toBe(true)
  })

  it("パスの末尾のスラッシュの有無は別のページとみなす", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/docs/")).toBe(true)
  })

  it("ホストが違えば移動した", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.org/docs")).toBe(true)
  })

  it("スキームが違えば移動した", () => {
    expect(hasNavigatedAway("http://example.com/docs", "https://example.com/docs")).toBe(true)
  })

  it("chrome:// のページ同士でも、ページ名が違えば移動した", () => {
    expect(hasNavigatedAway("chrome://settings/", "chrome://history/")).toBe(true)
  })
})

describe("URL として解釈できない文字列を比べるとき", () => {
  it("同じ文字列なら移動していない", () => {
    expect(hasNavigatedAway("not a url", "not a url")).toBe(false)
  })

  it("違う文字列なら移動した", () => {
    expect(hasNavigatedAway("not a url", "another text")).toBe(true)
  })

  it("空文字同士なら移動していない", () => {
    expect(hasNavigatedAway("", "")).toBe(false)
  })

  it("片方だけが URL として解釈できるなら移動した", () => {
    expect(hasNavigatedAway("", "https://example.com/")).toBe(true)
  })
})
