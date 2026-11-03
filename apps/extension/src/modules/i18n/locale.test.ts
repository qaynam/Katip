import { describe, expect, it } from "vitest"
import { resolveLocale } from "./locale"

describe("with a language chosen", () => {
  it("resolves to the chosen language whatever the browser's languages", () => {
    expect(resolveLocale("es", ["ja-JP", "en-US"])).toBe("es")
  })
})

describe("automatic", () => {
  it("resolves to the browser's most preferred language when it is supported", () => {
    expect(resolveLocale("auto", ["ja", "en"])).toBe("ja")
  })

  it.each([
    ["ja-JP", "ja"],
    ["zh-CN", "zh"],
    ["es-MX", "es"],
    ["es-419", "es"],
    ["en-GB", "en"],
  ])("treats the regional language code %s as %s", (browserLanguage, locale) => {
    expect(resolveLocale("auto", [browserLanguage])).toBe(locale)
  })

  it("ignores letter case", () => {
    expect(resolveLocale("auto", ["JA-jp"])).toBe("ja")
  })

  it("when the most preferred language isn't supported, resolves to the next preferred one that is", () => {
    expect(resolveLocale("auto", ["fr-FR", "de", "es-ES", "ja"])).toBe("es")
  })

  it("falls back to English when none of the languages is supported", () => {
    expect(resolveLocale("auto", ["fr-FR", "de"])).toBe("en")
  })

  it("falls back to English when the browser has no languages", () => {
    expect(resolveLocale("auto", [])).toBe("en")
  })

  it.each(["zh", "zh-SG", "zh-Hans-HK"])(
    "resolves Simplified Chinese %s to Chinese (Simplified)",
    (tag) => {
      expect(resolveLocale("auto", [tag])).toBe("zh")
    },
  )

  it.each(["zh-TW", "zh-HK", "zh-Hant"])(
    "does not take Traditional Chinese %s as Simplified, and looks for the next preferred language",
    (tag) => {
      expect(resolveLocale("auto", [tag, "ja"])).toBe("ja")
    },
  )

  it("skips values that aren't language codes", () => {
    expect(resolveLocale("auto", ["", "not a language", "es"])).toBe("es")
  })
})
