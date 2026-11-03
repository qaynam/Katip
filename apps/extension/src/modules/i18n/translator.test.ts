import { describe, expect, it } from "vitest"
import { Locale } from "./locale"
import { makeTranslator } from "./translator"

describe("messages", () => {
  it("are in each language's wording", () => {
    expect(
      Locale.literals.map((locale) => makeTranslator(locale).t("common.newFolder")),
    ).toStrictEqual(["New Folder", "新しいフォルダ", "新建文件夹", "Nueva carpeta"])
  })
})

describe("placeholders", () => {
  it("are filled with the values passed", () => {
    expect(makeTranslator("es").t("common.spaceNumbered", { n: 3 })).toBe("Espacio 3")
  })

  it("write numbers with the language's digit grouping", () => {
    expect(makeTranslator("en").t("common.tabCount", { count: 1440 })).toBe("1,440 tabs")
  })

  it("fail the type check when no values are passed, and stay as they are when run", () => {
    // @ts-expect-error -- no values passed
    expect(makeTranslator("en").t("common.spaceNumbered")).toBe("Space {n}")
  })

  it("fail the type check when passed a name the English message doesn't have", () => {
    // @ts-expect-error -- the English message's placeholder is named n
    expect(makeTranslator("en").t("common.spaceNumbered", { index: 2 })).toBe("Space {n}")
  })

  it("fail the type check when the count isn't a number", () => {
    // @ts-expect-error -- the count must be a number
    expect(makeTranslator("en").t("common.tabCount", { count: "2" })).toBe("2 tabs")
  })

  it("insert a string value as it is, without filling placeholders inside it", () => {
    expect(makeTranslator("en").t("options.language.automatic", { language: "{language}" })).toBe(
      "Automatic ({language})",
    )
  })
})

describe("plural forms", () => {
  it.each([
    [1, "1 tab"],
    [2, "2 tabs"],
    [0, "0 tabs"],
  ])('in English, a count of %i is "%s"', (count, text) => {
    expect(makeTranslator("en").t("common.tabCount", { count })).toBe(text)
  })

  it.each([
    [1, "1 pestaña"],
    [3, "3 pestañas"],
  ])('in Spanish, a count of %i is "%s"', (count, text) => {
    expect(makeTranslator("es").t("common.tabCount", { count })).toBe(text)
  })

  it("are the same whatever the count in a language that doesn't tell singular from plural", () => {
    const translator = makeTranslator("ja")

    expect([1, 2].map((count) => translator.t("common.tabCount", { count }))).toStrictEqual([
      "1 個のタブ",
      "2 個のタブ",
    ])
  })

  it("fall back to the other form when the translation lacks the form the language's rules pick", () => {
    expect(makeTranslator("es").t("common.tabCount", { count: 1_000_000 })).toBe(
      "1.000.000 pestañas",
    )
  })
})

describe("lengths of time", () => {
  it.each([
    ["en", { value: 6, unit: "hour" }, "6 hours"],
    ["en", { value: 1, unit: "day" }, "1 day"],
    ["en", { value: 30, unit: "minute" }, "30 minutes"],
    ["ja", { value: 6, unit: "hour" }, "6 時間"],
    ["ja", { value: 1, unit: "week" }, "1 週間"],
    ["zh", { value: 6, unit: "hour" }, "6 小时"],
    ["zh", { value: 3, unit: "day" }, "3 天"],
    ["es", { value: 6, unit: "hour" }, "6 horas"],
    ["es", { value: 1, unit: "week" }, "1 semana"],
  ] as const)('in %s, %o is "%s"', (locale, duration, text) => {
    expect(makeTranslator(locale).duration(duration)).toBe(text)
  })
})

describe("relative time", () => {
  it.each([
    ["en", "2 hours ago"],
    ["ja", "2 時間前"],
    ["zh", "2小时前"],
    ["es", "hace 2 horas"],
  ] as const)('in %s, 2 hours ago is "%s"', (locale, text) => {
    expect(makeTranslator(locale).relativeTime(-2, "hour")).toBe(text)
  })

  it("0 seconds from now is worded as now", () => {
    expect(makeTranslator("en").relativeTime(0, "second")).toBe("now")
  })
})

describe("language names", () => {
  it("are written in the translator's language", () => {
    expect(makeTranslator("es").languageName("ja")).toBe("japonés")
  })

  it("name Chinese as Simplified Chinese", () => {
    expect(makeTranslator("en").languageName("zh")).toBe("Simplified Chinese")
  })
})
