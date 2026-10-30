import { describe, expect, it } from "vitest"
import { resolveLocale } from "./locale"

describe("言語を指定したとき", () => {
  it("ブラウザの言語に関係なく、指定した言語になる", () => {
    expect(resolveLocale("es", ["ja-JP", "en-US"])).toBe("es")
  })
})

describe("自動のとき", () => {
  it("ブラウザが最も優先する言語に対応していれば、その言語になる", () => {
    expect(resolveLocale("auto", ["ja", "en"])).toBe("ja")
  })

  it.each([
    ["ja-JP", "ja"],
    ["zh-CN", "zh"],
    ["es-MX", "es"],
    ["es-419", "es"],
    ["en-GB", "en"],
  ])("地域付きの言語コード %s は %s として扱う", (browserLanguage, locale) => {
    expect(resolveLocale("auto", [browserLanguage])).toBe(locale)
  })

  it("大文字と小文字の違いを問わない", () => {
    expect(resolveLocale("auto", ["JA-jp"])).toBe("ja")
  })

  it("最も優先する言語に対応していなければ、次に優先する言語のうち対応しているものになる", () => {
    expect(resolveLocale("auto", ["fr-FR", "de", "es-ES", "ja"])).toBe("es")
  })

  it("対応している言語が 1 つも無ければ英語になる", () => {
    expect(resolveLocale("auto", ["fr-FR", "de"])).toBe("en")
  })

  it("ブラウザの言語が 1 つも無ければ英語になる", () => {
    expect(resolveLocale("auto", [])).toBe("en")
  })

  it.each(["zh", "zh-SG", "zh-Hans-HK"])("簡体字の中国語 %s は中国語（簡体字）になる", (tag) => {
    expect(resolveLocale("auto", [tag])).toBe("zh")
  })

  it.each(["zh-TW", "zh-HK", "zh-Hant"])(
    "繁体字の中国語 %s は簡体字として扱わず、次に優先する言語を探す",
    (tag) => {
      expect(resolveLocale("auto", [tag, "ja"])).toBe("ja")
    },
  )

  it("言語コードとして読めない値は飛ばす", () => {
    expect(resolveLocale("auto", ["", "not a language", "es"])).toBe("es")
  })
})
