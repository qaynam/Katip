import { describe, expect, it } from "vitest"
import { hasNavigatedAway } from "./pinned-url"

describe("on the same page as the pinned URL", () => {
  it("an identical URL hasn't moved away", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/docs")).toBe(false)
  })

  it("a different query alone hasn't moved away", () => {
    expect(
      hasNavigatedAway(
        "https://docs.example.com/d/1/edit",
        "https://docs.example.com/d/1/edit?tab=t.0",
      ),
    ).toBe(false)
  })

  it("a different hash alone hasn't moved away", () => {
    expect(
      hasNavigatedAway("https://example.com/docs#intro", "https://example.com/docs#usage"),
    ).toBe(false)
  })

  it("an explicit default port or a differently cased host counts as the same place", () => {
    expect(hasNavigatedAway("https://Example.com:443/docs", "https://example.com/docs")).toBe(false)
  })

  it("a root with or without a trailing slash counts as the same place", () => {
    expect(hasNavigatedAway("https://example.com", "https://example.com/")).toBe(false)
  })
})

describe("on a different page from the pinned URL", () => {
  it("a different path has moved away", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/blog")).toBe(true)
  })

  it("a path with or without a trailing slash counts as a different page", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.com/docs/")).toBe(true)
  })

  it("a different host has moved away", () => {
    expect(hasNavigatedAway("https://example.com/docs", "https://example.org/docs")).toBe(true)
  })

  it("a different scheme has moved away", () => {
    expect(hasNavigatedAway("http://example.com/docs", "https://example.com/docs")).toBe(true)
  })

  it("between chrome:// pages, a different page name has moved away", () => {
    expect(hasNavigatedAway("chrome://settings/", "chrome://history/")).toBe(true)
  })
})

describe("comparing strings that don't parse as URLs", () => {
  it("the same string hasn't moved away", () => {
    expect(hasNavigatedAway("not a url", "not a url")).toBe(false)
  })

  it("a different string has moved away", () => {
    expect(hasNavigatedAway("not a url", "another text")).toBe(true)
  })

  it("two empty strings haven't moved away", () => {
    expect(hasNavigatedAway("", "")).toBe(false)
  })

  it("when only one of them parses as a URL, it has moved away", () => {
    expect(hasNavigatedAway("", "https://example.com/")).toBe(true)
  })
})
