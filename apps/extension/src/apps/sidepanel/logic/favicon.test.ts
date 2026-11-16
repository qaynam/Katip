import { describe, expect, it } from "vitest"
import {
  faviconCandidates,
  faviconLetter,
  faviconToneOf,
  noFaviconResolver,
  toneSampleUrl,
} from "./favicon"

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

// An 8×8 icon: `shape` pixels in the given color, the rest transparent unless `backdrop` is given
const icon = (
  shape: readonly [number, number, number],
  options: { readonly share?: number; readonly backdrop?: readonly [number, number, number] } = {},
) => {
  const { share = 0.5, backdrop } = options
  const pixelCount = 64
  const shapePixels = Math.round(pixelCount * share)
  return Array.from({ length: pixelCount }, (_, index) =>
    index < shapePixels
      ? [...shape, 255]
      : backdrop === undefined
        ? [0, 0, 0, 0]
        : [...backdrop, 255],
  ).flat()
}

const WHITE = [255, 255, 255] as const
const BLACK = [24, 24, 24] as const
const GREEN = [40, 170, 80] as const

describe("faviconToneOf", () => {
  it("reads a white shape on transparency as light, as icons made for dark mode are", () => {
    expect(faviconToneOf(icon(WHITE))).toBe("Light")
  })

  it("reads a black shape on transparency as dark", () => {
    expect(faviconToneOf(icon(BLACK))).toBe("Dark")
  })

  it("reads a colorful icon as mixed, as it shows on any background", () => {
    expect(faviconToneOf(icon(GREEN))).toBe("Mixed")
  })

  it("reads a shape on a backdrop of the other tone as mixed, as it carries its own contrast", () => {
    expect(faviconToneOf(icon(WHITE, { backdrop: BLACK }))).toBe("Mixed")
  })

  it("reads an icon that shows almost nothing as mixed", () => {
    expect(faviconToneOf(icon(WHITE, { share: 0.02 }))).toBe("Mixed")
  })
})

describe("toneSampleUrl", () => {
  it("reads the shown icon itself when it is the browser's saved favicon", () => {
    const saved = resolver("https://a.test/")

    expect(toneSampleUrl(saved, "https://a.test/", resolver)).toBe(saved)
  })

  it("reads the saved favicon of the page in place of a tab's favicon from the site, which the side panel can't read", () => {
    expect(toneSampleUrl("https://a.test/icon.png", "https://a.test/", resolver)).toBe(
      "chrome-extension://katip/_favicon/?pageUrl=https://a.test/",
    )
  })

  it("has nothing to read without a saved favicon to fall back on", () => {
    expect(toneSampleUrl("https://a.test/icon.png", "https://a.test/", noFaviconResolver)).toBe(
      null,
    )
  })
})
