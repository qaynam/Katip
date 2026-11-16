import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { formatBytes, progressDetails, sourceHostOf } from "./downloads"

const en = makeTranslator("en")

describe("formatBytes", () => {
  it("writes a size in the largest unit it reaches, counting 1024 to the next", () => {
    expect([
      formatBytes(512, "en"),
      formatBytes(1536, "en"),
      formatBytes(3.25 * 1024 * 1024, "en"),
      formatBytes(1.5 * 1024 ** 3, "en"),
    ]).toStrictEqual(["512 B", "1.5 KB", "3.3 MB", "1.5 GB"])
  })

  it("drops the decimal from 100 of a unit up", () => {
    expect(formatBytes(123.4 * 1024 * 1024, "en")).toBe("123 MB")
  })

  it("writes nothing downloaded yet as 0 B", () => {
    expect(formatBytes(0, "en")).toBe("0 B")
  })

  it("writes the number the way the language does", () => {
    expect(formatBytes(1536, "es")).toBe("1,5 KB")
  })
})

describe("sourceHostOf", () => {
  it("is the host of the URL the file came from", () => {
    expect(sourceHostOf("https://files.example.com/report.pdf")).toStrictEqual(
      Option.some("files.example.com"),
    )
  })

  it("for a file a page made itself, is that page's site", () => {
    expect(sourceHostOf("blob:https://www.figma.com/2f1c6a3e")).toStrictEqual(
      Option.some("www.figma.com"),
    )
  })

  it("is none for a file written out in its URL", () => {
    expect(sourceHostOf("data:text/plain;base64,SGVsbG8=")).toStrictEqual(Option.none())
  })
})

describe("progressDetails", () => {
  it("tells a running download's size so far out of the whole", () => {
    expect(
      progressDetails({ _tag: "InProgress", receivedBytes: 1024, totalBytes: 4096 }, en),
    ).toStrictEqual(["1 KB of 4 KB"])
  })

  it("tells only the size so far when the whole isn't known", () => {
    expect(
      progressDetails({ _tag: "InProgress", receivedBytes: 2048, totalBytes: null }, en),
    ).toStrictEqual(["2 KB"])
  })

  it("says a paused download is paused, and how far it got", () => {
    expect(
      progressDetails(
        { _tag: "Paused", receivedBytes: 1024, totalBytes: 4096, canResume: true },
        en,
      ),
    ).toStrictEqual(["Paused", "1 KB of 4 KB"])
  })

  it("tells a finished file's size, or what became of a download that didn't finish", () => {
    expect([
      progressDetails({ _tag: "Complete", bytes: 2048 }, en),
      progressDetails({ _tag: "Deleted" }, en),
      progressDetails({ _tag: "Canceled" }, en),
      progressDetails({ _tag: "Failed", canResume: false }, en),
    ]).toStrictEqual([["2 KB"], ["Deleted"], ["Canceled"], ["Failed"]])
  })
})
