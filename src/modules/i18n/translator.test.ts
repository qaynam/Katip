import { describe, expect, it } from "vitest"
import { Locale } from "./locale"
import { makeTranslator } from "./translator"

describe("文言", () => {
  it("言語ごとの文言になる", () => {
    expect(
      Locale.literals.map((locale) => makeTranslator(locale).t("common.newFolder")),
    ).toStrictEqual(["New Folder", "新しいフォルダ", "新建文件夹", "Nueva carpeta"])
  })
})

describe("差し込み", () => {
  it("渡した値が差し込まれる", () => {
    expect(makeTranslator("es").t("common.spaceNumbered", { n: 3 })).toBe("Espacio 3")
  })

  it("差し込む数値は、その言語の桁区切りで書かれる", () => {
    expect(makeTranslator("en").t("common.tabCount", { count: 1440 })).toBe("1,440 tabs")
  })

  it("差し込む値を渡さないと型検査で落ち、実行しても差し込む箇所がそのまま残る", () => {
    // @ts-expect-error -- 差し込む値を渡していない
    expect(makeTranslator("en").t("common.spaceNumbered")).toBe("Space {n}")
  })

  it("英語の文言に無い名前の値を渡すと型検査で落ちる", () => {
    // @ts-expect-error -- 英語の文言で差し込む値の名前は n
    expect(makeTranslator("en").t("common.spaceNumbered", { index: 2 })).toBe("Space {n}")
  })

  it("件数に数値以外を渡すと型検査で落ちる", () => {
    // @ts-expect-error -- 件数は数値で渡す必要がある
    expect(makeTranslator("en").t("common.tabCount", { count: "2" })).toBe("2 tabs")
  })

  it("差し込む文字列は、そのまま差し込まれる", () => {
    expect(makeTranslator("ja").t("options.language.automatic", { language: "{英語}" })).toBe(
      "自動（{英語}）",
    )
  })
})

describe("件数による語形", () => {
  it.each([
    [1, "1 tab"],
    [2, "2 tabs"],
    [0, "0 tabs"],
  ])("英語では %i 件が「%s」になる", (count, text) => {
    expect(makeTranslator("en").t("common.tabCount", { count })).toBe(text)
  })

  it.each([
    [1, "1 pestaña"],
    [3, "3 pestañas"],
  ])("スペイン語では %i 件が「%s」になる", (count, text) => {
    expect(makeTranslator("es").t("common.tabCount", { count })).toBe(text)
  })

  it("単数と複数を区別しない言語では、件数によらず同じ語形になる", () => {
    const translator = makeTranslator("ja")

    expect([1, 2].map((count) => translator.t("common.tabCount", { count }))).toStrictEqual([
      "1 個のタブ",
      "2 個のタブ",
    ])
  })

  it("その言語の規則が選ぶ語形が訳に無ければ、other の語形になる", () => {
    expect(makeTranslator("es").t("common.tabCount", { count: 1_000_000 })).toBe(
      "1.000.000 pestañas",
    )
  })
})

describe("相対時刻", () => {
  it.each([
    ["en", "2 hours ago"],
    ["ja", "2 時間前"],
    ["zh", "2小时前"],
    ["es", "hace 2 horas"],
  ] as const)("%s では 2 時間前が「%s」になる", (locale, text) => {
    expect(makeTranslator(locale).relativeTime(-2, "hour")).toBe(text)
  })

  it("0 秒後は「今」を表す言い方になる", () => {
    expect(makeTranslator("ja").relativeTime(0, "second")).toBe("今")
  })
})

describe("言語の名前", () => {
  it("その言語で書いた言語の名前になる", () => {
    expect(makeTranslator("ja").languageName("es")).toBe("スペイン語")
  })

  it("中国語は簡体字の中国語として名指す", () => {
    expect(makeTranslator("en").languageName("zh")).toBe("Simplified Chinese")
  })
})
