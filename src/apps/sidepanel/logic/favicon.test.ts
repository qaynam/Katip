import { describe, expect, it } from "vitest"
import { faviconCandidates, faviconLetter, noFaviconResolver } from "./favicon"

const resolver = (pageUrl: string) => `chrome-extension://katip/_favicon/?pageUrl=${pageUrl}`

describe("faviconCandidates", () => {
  it("タブの favicon を先に、ページ URL から解決した favicon を次に試す", () => {
    expect(faviconCandidates("https://a.test/", "https://a.test/icon.png", resolver)).toStrictEqual(
      ["https://a.test/icon.png", "chrome-extension://katip/_favicon/?pageUrl=https://a.test/"],
    )
  })

  it("タブの favicon が無ければ、ページ URL から解決した favicon だけを試す", () => {
    expect(faviconCandidates("https://a.test/", null, resolver)).toStrictEqual([
      "chrome-extension://katip/_favicon/?pageUrl=https://a.test/",
    ])
  })

  it("どちらも無ければ候補は無い", () => {
    expect(faviconCandidates("https://a.test/", "", noFaviconResolver)).toStrictEqual([])
  })
})

describe("faviconLetter", () => {
  it("画像が無いときは、ホスト名の頭文字を www. を除いて大文字で出す", () => {
    expect(faviconLetter("https://www.example.com/page", "Example")).toBe("E")
  })

  it("ホスト名の無い URL ではタイトルの頭文字を出す", () => {
    expect(faviconLetter("about:blank", "新しいタブ")).toBe("新")
  })
})
