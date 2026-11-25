import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { carriesLink, droppedLinkOf } from "./dropped-link"

const noData = { uriList: "", html: "", text: "" }

describe("droppedLinkOf", () => {
  it("takes the address from the URI list and the name from the link's text", () => {
    const link = droppedLinkOf({
      uriList: "https://linked.example/page",
      html: '<meta charset="utf-8"><a href="https://linked.example/page"><b>Linked</b> page</a>',
      text: "https://linked.example/page",
    })

    expect(Option.getOrNull(link)).toStrictEqual({
      url: "https://linked.example/page",
      title: "Linked page",
    })
  })

  it("takes the first address, skipping comments", () => {
    const link = droppedLinkOf({
      ...noData,
      uriList: "# a comment\r\nhttps://first.example/\r\nhttps://second.example/",
    })

    expect(Option.map(link, ({ url }) => url)).toStrictEqual(Option.some("https://first.example/"))
  })

  it("names it by its plain text without a link in the HTML, unless that text is the address", () => {
    const named = droppedLinkOf({ ...noData, uriList: "https://a.example/", text: "Docs" })
    const unnamed = droppedLinkOf({
      ...noData,
      uriList: "https://a.example/",
      text: "https://a.example/",
    })

    expect([named, unnamed].map((link) => Option.map(link, ({ title }) => title))).toStrictEqual([
      Option.some("Docs"),
      Option.some(""),
    ])
  })

  it("is none for a drag without an address", () => {
    expect(droppedLinkOf({ ...noData, text: "Just some text" })).toStrictEqual(Option.none())
  })
})

describe("carriesLink", () => {
  it("tells a dragged link from dragged text or files", () => {
    expect([
      carriesLink(["text/uri-list", "text/html", "text/plain"]),
      carriesLink(["text/html", "text/plain"]),
      carriesLink(["Files"]),
    ]).toStrictEqual([true, false, false])
  })
})
