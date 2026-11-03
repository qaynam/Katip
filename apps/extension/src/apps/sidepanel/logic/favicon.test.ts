import { describe, expect, it } from "vitest"
import { faviconCandidates, faviconLetter, noFaviconResolver } from "./favicon"

const resolver = (pageUrl: string) => `chrome-extension://katip/_favicon/?pageUrl=${pageUrl}`

describe("faviconCandidates", () => {
  it("tries the tab's favicon first, then the one resolved from the page URL", () => {
    expect(faviconCandidates("https://a.test/", "https://a.test/icon.png", resolver)).toStrictEqual(
      ["https://a.test/icon.png", "chrome-extension://katip/_favicon/?pageUrl=https://a.test/"],
    )
  })

  it("tries only the favicon resolved from the page URL when the tab has none", () => {
    expect(faviconCandidates("https://a.test/", null, resolver)).toStrictEqual([
      "chrome-extension://katip/_favicon/?pageUrl=https://a.test/",
    ])
  })

  it("has no candidates when neither is available", () => {
    expect(faviconCandidates("https://a.test/", "", noFaviconResolver)).toStrictEqual([])
  })
})

describe("faviconLetter", () => {
  it("shows the uppercased initial of the host name without www. when there is no image", () => {
    expect(faviconLetter("https://www.example.com/page", "Example")).toBe("E")
  })

  it("shows the initial of the title for a URL without a host name", () => {
    expect(faviconLetter("about:blank", "new tab")).toBe("N")
  })
})
