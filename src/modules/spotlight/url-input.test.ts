import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { urlFromInput } from "./url-input"

describe("URL らしい入力", () => {
  describe("scheme を書いた入力", () => {
    it.each([
      ["https://example.com/path?q=1", "https://example.com/path?q=1"],
      ["http://localhost:5173/", "http://localhost:5173/"],
      ["chrome://settings", "chrome://settings"],
      ["about:blank", "about:blank"],
      ["file:///Users/me/a.html", "file:///Users/me/a.html"],
    ])("%s はそのまま開く", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: true }))
    })

    it("前後の空白は除く", () => {
      expect(urlFromInput("  https://example.com  ")).toStrictEqual(
        Option.some({ url: "https://example.com", hasScheme: true }),
      )
    })

    it("javascript: は開かない", () => {
      expect(urlFromInput("javascript:alert(1)")).toStrictEqual(Option.none())
    })

    it("ホストの無い http は開かない", () => {
      expect(urlFromInput("https://")).toStrictEqual(Option.none())
    })
  })

  describe("scheme を省いた入力", () => {
    it.each([
      ["example.com", "https://example.com"],
      ["docs.example.co.jp/guide?x=1", "https://docs.example.co.jp/guide?x=1"],
      ["example.com:8080", "https://example.com:8080"],
      ["例え.jp", "https://例え.jp"],
    ])("ドメイン名の %s は https で開く", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: false }))
    })

    it.each([
      ["localhost:3000/app", "http://localhost:3000/app"],
      ["localhost", "http://localhost"],
      ["192.168.0.1:8080", "http://192.168.0.1:8080"],
    ])("手元のサーバーの %s は http で開く", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: false }))
    })
  })

  describe("URL らしくない入力", () => {
    it.each([
      ["空", ""],
      ["空白を含む", "example.com is down"],
      ["ドットの無い語", "katip"],
      ["1 文字の末尾", "e.g"],
      ["数字の末尾", "version 1.5"],
      ["小数", "3.14"],
      ["日本語の文", "設計ドキュメント"],
    ])("%s は URL とみなさない", (_, input) => {
      expect(urlFromInput(input)).toStrictEqual(Option.none())
    })
  })
})
