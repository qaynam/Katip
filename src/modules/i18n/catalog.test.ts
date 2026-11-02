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

describe.each(Record.toEntries(translations))("the %s catalog", (_locale, catalog) => {
  it("has every key of the English catalog and no other", () => {
    expect(Object.keys(catalog).toSorted()).toStrictEqual(Object.keys(en).toSorted())
  })

  it("fills in values of the same names as English in every message", () => {
    const namesOf = (message: Message) => placeholderNamesIn(message).toSorted()

    expect(Record.map(catalog, namesOf)).toStrictEqual(Record.map(en, namesOf))
  })

  it("picks the wording by count wherever English does", () => {
    expect(Record.map(catalog, shapeOf)).toStrictEqual(Record.map(en, shapeOf))
  })
})

describe("the type of a translated catalog", () => {
  it("fails the type check when a key of the English catalog is missing", () => {
    const incomplete = Struct.omit(en, ["options.title"])

    // @ts-expect-error -- a catalog without options.title
    const catalog: Catalog = incomplete

    expect(Object.keys(catalog)).not.toContain("options.title")
  })

  it("fails the type check with a key English doesn't have", () => {
    // @ts-expect-error -- has options.unknown, which English doesn't have
    const catalog: Catalog = { ...en, "options.unknown": "Unknown" }

    expect(Object.keys(catalog)).toContain("options.unknown")
  })

  it("fails the type check when a message with plural forms in English is a plain string", () => {
    // @ts-expect-error -- a string without plural forms
    const catalog: Catalog = { ...en, "common.tabCount": "{count} tabs" }

    expect(catalog["common.tabCount"]).toBe("{count} tabs")
  })
})

describe.each(Record.toEntries(catalogs))("the %s catalog", (_locale, catalog) => {
  it("has no blank messages", () => {
    const blank = Record.filter(catalog, (message) =>
      textsOf(message).some((text) => text.trim() === ""),
    )

    expect(Object.keys(blank)).toStrictEqual([])
  })
})
