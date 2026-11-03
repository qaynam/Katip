import { describe, expect, it } from "vitest"
import { preferredLanguage } from "./preferred-language.ts"

describe("preferredLanguage", () => {
  it.each([
    ["ja", "ja"],
    ["ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7", "ja"],
    ["en-US,en;q=0.9,ja;q=0.8", "en"],
    ["en-GB", "en"],
  ])("picks the language a browser asking for %s puts first", (header, expected) => {
    expect(preferredLanguage(header)).toBe(expected)
  })

  it("ranks by quality, not by the order of the list", () => {
    expect(preferredLanguage("en;q=0.5, ja;q=0.8")).toBe("ja")
  })

  it("keeps the listed order between languages of the same quality", () => {
    expect(preferredLanguage("ja;q=0.8, en;q=0.8")).toBe("ja")
    expect(preferredLanguage("en, ja")).toBe("en")
  })

  it("skips languages the site doesn't have to find the best one it does", () => {
    expect(preferredLanguage("fr-FR, fr;q=0.9, ja;q=0.5")).toBe("ja")
    expect(preferredLanguage("zh-CN, en;q=0.6, ja;q=0.4")).toBe("en")
  })

  it("ignores case in language tags", () => {
    expect(preferredLanguage("JA-jp")).toBe("ja")
  })

  it("doesn't take a language with a quality of 0", () => {
    expect(preferredLanguage("ja;q=0, fr")).toBe("en")
  })

  it("doesn't mistake a language that merely starts with the same letters", () => {
    expect(preferredLanguage("jam, enm")).toBe("en")
    expect(preferredLanguage("jam;q=1, ja;q=0.1, enm;q=0.5")).toBe("ja")
  })

  it("skips ranges with an unreadable quality", () => {
    expect(preferredLanguage("ja;q=high, en;q=0.1")).toBe("en")
  })

  it.each([[null], [""], ["*"], ["fr, de;q=0.8"], [" , ;q=1"]])(
    "falls back to English for %j",
    (header) => {
      expect(preferredLanguage(header)).toBe("en")
    },
  )
})
