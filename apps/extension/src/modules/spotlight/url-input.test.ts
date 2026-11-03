import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { urlFromInput } from "./url-input"

describe("input that looks like a URL", () => {
  describe("with a scheme", () => {
    it.each([
      ["https://example.com/path?q=1", "https://example.com/path?q=1"],
      ["http://localhost:5173/", "http://localhost:5173/"],
      ["chrome://settings", "chrome://settings"],
      ["about:blank", "about:blank"],
      ["file:///Users/me/a.html", "file:///Users/me/a.html"],
    ])("opens %s as it is", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: true }))
    })

    it("drops the surrounding whitespace", () => {
      expect(urlFromInput("  https://example.com  ")).toStrictEqual(
        Option.some({ url: "https://example.com", hasScheme: true }),
      )
    })

    it("doesn't open javascript:", () => {
      expect(urlFromInput("javascript:alert(1)")).toStrictEqual(Option.none())
    })

    it("doesn't open http without a host", () => {
      expect(urlFromInput("https://")).toStrictEqual(Option.none())
    })
  })

  describe("without a scheme", () => {
    it.each([
      ["example.com", "https://example.com"],
      ["docs.example.co.jp/guide?x=1", "https://docs.example.co.jp/guide?x=1"],
      ["example.com:8080", "https://example.com:8080"],
      ["例え.jp", "https://例え.jp"],
    ])("opens the domain name %s, including an internationalized one, with https", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: false }))
    })

    it.each([
      ["localhost:3000/app", "http://localhost:3000/app"],
      ["localhost", "http://localhost"],
      ["192.168.0.1:8080", "http://192.168.0.1:8080"],
    ])("opens the local server %s with http", (input, url) => {
      expect(urlFromInput(input)).toStrictEqual(Option.some({ url, hasScheme: false }))
    })
  })

  describe("input that doesn't look like a URL", () => {
    it.each([
      ["an empty input", ""],
      ["an input with whitespace", "example.com is down"],
      ["a word without a dot", "katip"],
      ["a one-letter last label", "e.g"],
      ["a numeric last label", "version 1.5"],
      ["a decimal number", "3.14"],
      ["a Japanese phrase", "設計ドキュメント"],
    ])("doesn't treat %s as a URL", (_, input) => {
      expect(urlFromInput(input)).toStrictEqual(Option.none())
    })
  })
})
