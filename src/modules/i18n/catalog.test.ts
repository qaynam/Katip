import { Record, Struct } from "effect"
import { describe, expect, it } from "vitest"
import { type Catalog, catalogs } from "./catalog"
import type { Message } from "./message"

const textsOf = (message: Message): ReadonlyArray<string> =>
  typeof message === "string"
    ? [message]
    : Object.values(message).filter((text) => text !== undefined)

const placeholderNamesIn = (message: Message): ReadonlyArray<string> => [
  ...new Set(
    textsOf(message).flatMap((text) =>
      [...text.matchAll(/\{(\w+)\}/g)].flatMap(([, name]) => (name === undefined ? [] : [name])),
    ),
  ),
]

const shapeOf = (message: Message) => (typeof message === "string" ? "text" : "plural")

const { en, ...translations } = catalogs

describe.each(Record.toEntries(translations))("%s のカタログ", (_locale, catalog) => {
  it("英語のカタログと同じキーをすべて持ち、余分なキーを持たない", () => {
    expect(Object.keys(catalog).toSorted()).toStrictEqual(Object.keys(en).toSorted())
  })

  it("どの文言も、英語と同じ名前の値を差し込む", () => {
    const namesOf = (message: Message) => placeholderNamesIn(message).toSorted()

    expect(Record.map(catalog, namesOf)).toStrictEqual(Record.map(en, namesOf))
  })

  it("件数で語形が変わる文言は、英語と同じく件数で語形を選ぶ", () => {
    expect(Record.map(catalog, shapeOf)).toStrictEqual(Record.map(en, shapeOf))
  })
})

describe("訳のカタログの型", () => {
  it("英語にあるキーが欠けていると型検査で落ちる", () => {
    const incomplete = Struct.omit(en, ["options.title"])

    // @ts-expect-error -- options.title が欠けたカタログ
    const catalog: Catalog = incomplete

    expect(Object.keys(catalog)).not.toContain("options.title")
  })

  it("英語に無いキーがあると型検査で落ちる", () => {
    // @ts-expect-error -- 英語に無いキー options.unknown を持つ
    const catalog: Catalog = { ...en, "options.unknown": "Unknown" }

    expect(Object.keys(catalog)).toContain("options.unknown")
  })

  it("英語で件数により語形が変わる文言を、語形の無い文字列にすると型検査で落ちる", () => {
    // @ts-expect-error -- 件数による語形を持たない文字列にしている
    const catalog: Catalog = { ...en, "common.tabCount": "{count} tabs" }

    expect(catalog["common.tabCount"]).toBe("{count} tabs")
  })
})

describe.each(Record.toEntries(catalogs))("%s のカタログ", (_locale, catalog) => {
  it("空の文言が無い", () => {
    const blank = Record.filter(catalog, (message) =>
      textsOf(message).some((text) => text.trim() === ""),
    )

    expect(Object.keys(blank)).toStrictEqual([])
  })
})
