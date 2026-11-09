import { describe, expect, it } from "vitest"
import { type Bang, DEFAULT_BANG_FORMAT, formatOfFlags } from "./bang"
import { bangUrl, searchesWithQuery, siteUrlOf } from "./bang-url"

const bang = (template: string, flags?: number): Bang => ({
  name: "Example",
  triggers: ["ex"],
  template,
  format: formatOfFlags(flags),
})

describe("the page a bang opens", () => {
  it("is its URL with the query encoded in place of %s, spaces as +", () => {
    expect(bangUrl(bang("https://github.com/search?q=%s"), "effect ts & svelte")).toBe(
      "https://github.com/search?q=effect+ts+%26+svelte",
    )
  })

  it("fills in every %s", () => {
    expect(bangUrl(bang("https://example.com/%s?q=%s"), "a b")).toBe(
      "https://example.com/a+b?q=a+b",
    )
  })

  it("leaves the spaces around the query out", () => {
    expect(bangUrl(bang("https://example.com/?q=%s"), "  word  ")).toBe(
      "https://example.com/?q=word",
    )
  })

  it("encodes spaces as %20 for a bang whose flags leave out the + encoding", () => {
    // Percent-encoding the query on (4), + for spaces off
    expect(bangUrl(bang("https://jisho.org/search/%s", 4 | 1), "猫 犬")).toBe(
      "https://jisho.org/search/%E7%8C%AB%20%E7%8A%AC",
    )
  })

  it("puts the query in as typed for a bang whose flags turn encoding off", () => {
    expect(bangUrl(bang("https://web.archive.org/web/*/%s", 1), "example.com/a?b")).toBe(
      "https://web.archive.org/web/*/example.com/a?b",
    )
  })

  it("is the site's top page when there is nothing to search for", () => {
    expect(bangUrl(bang("https://github.com/search?q=%s"), " ")).toBe("https://github.com/")
  })

  it("is the search page for nothing when the bang's flags say not to open the top page", () => {
    expect(bangUrl(bang("https://example.com/search?q=%s", 4), "")).toBe(
      "https://example.com/search?q=",
    )
  })

  it("is its URL as it is when it has no place for a query", () => {
    expect(bangUrl(bang("https://linear.app/new"), "anything")).toBe("https://linear.app/new")
  })
})

describe("the site of a bang", () => {
  it("is the top page of its URL's host", () => {
    expect(siteUrlOf(bang("https://www.youtube.com/results?search_query=%s"))).toBe(
      "https://www.youtube.com/",
    )
  })

  it("leaves out the label where the query goes when the query goes in the host name", () => {
    expect(siteUrlOf(bang("https://%s.wordpress.com/"))).toBe("https://wordpress.com/")
  })
})

describe("whether a bang searches for what is typed", () => {
  it("is so when its URL has a place for the query", () => {
    expect([
      searchesWithQuery(bang("https://example.com/?q=%s")),
      searchesWithQuery(bang("https://example.com/new")),
    ]).toStrictEqual([true, false])
  })
})

describe("a bang's format", () => {
  it("has every flag on for a bang that sets none", () => {
    expect(formatOfFlags(undefined)).toStrictEqual(DEFAULT_BANG_FORMAT)
  })

  it("has only the flags a bang sets", () => {
    expect(formatOfFlags(1 | 8)).toStrictEqual({
      opensTopPageWithoutQuery: true,
      encodesQuery: false,
      encodesSpaceAsPlus: true,
    })
  })
})
