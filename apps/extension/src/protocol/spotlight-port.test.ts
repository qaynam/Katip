import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { themeOf } from "#modules/theme"
import { WindowId } from "#platform/browser"
import { RequestId } from "./sidebar-port"
import {
  callerWindowOfSpotlight,
  SPOTLIGHT_PAGE_PATH,
  SpotlightClientMessage,
  type SpotlightOpening,
  spotlightOpeningOf,
  spotlightPageUrl,
  SpotlightServerMessage,
  targetOf,
} from "./spotlight-port"

const ORIGIN = "chrome-extension://katip-test/"

const opening: SpotlightOpening = {
  callerWindowId: WindowId.make(7),
  spaceTheme: themeOf([{ hue: 250, chroma: 0.4 }]),
  size: "Large",
  locale: "ja",
  address: null,
}

describe("the Spotlight page's URL", () => {
  it("points to the extension's Spotlight page", () => {
    const url = spotlightPageUrl(ORIGIN, opening)

    expect(url.startsWith(`${ORIGIN}${SPOTLIGHT_PAGE_PATH}?`)).toBe(true)
  })

  it("gives back the window that opened Spotlight", () => {
    const url = spotlightPageUrl(ORIGIN, opening)

    expect(callerWindowOfSpotlight(url)).toStrictEqual(Option.some(WindowId.make(7)))
  })

  it("gives back everything the first frame is drawn with: the Space's theme, size and language", () => {
    const url = spotlightPageUrl(ORIGIN, opening)

    expect(spotlightOpeningOf(url)).toStrictEqual(Option.some(opening))
  })

  it("gives back the address to edit, for a Spotlight that opens what's chosen in the current tab", () => {
    const url = spotlightPageUrl(ORIGIN, { ...opening, address: "https://example.com/a?b=1#c" })

    expect(
      Option.map(spotlightOpeningOf(url), (opened) => [opened.address, targetOf(opened)]),
    ).toStrictEqual(Option.some(["https://example.com/a?b=1#c", "CurrentTab"]))
  })

  it("opens what's chosen in a new tab when there's no address to edit", () => {
    const url = spotlightPageUrl(ORIGIN, opening)

    expect(Option.map(spotlightOpeningOf(url), targetOf)).toStrictEqual(Option.some("NewTab"))
  })

  it("carries a window in no Space as having no theme", () => {
    const url = spotlightPageUrl(ORIGIN, { ...opening, spaceTheme: null })

    expect(Option.map(spotlightOpeningOf(url), (opened) => opened.spaceTheme)).toStrictEqual(
      Option.some(null),
    )
  })

  it.each([
    [
      "names the window alone, as one opened by hand does",
      `${ORIGIN}${SPOTLIGHT_PAGE_PATH}?windowId=7`,
    ],
    [
      "has a theme that can't be read",
      `${ORIGIN}${SPOTLIGHT_PAGE_PATH}?windowId=7&theme=%7B&size=Large&locale=ja`,
    ],
    ["can't be parsed as a URL", "not a url"],
  ])("gives back nothing to draw the first frame with when it %s", (_, url) => {
    expect(spotlightOpeningOf(url)).toStrictEqual(Option.none())
  })

  it.each([
    ["names no window", `${ORIGIN}${SPOTLIGHT_PAGE_PATH}`],
    ["names a window that isn't a number", `${ORIGIN}${SPOTLIGHT_PAGE_PATH}?windowId=abc`],
    ["can't be parsed as a URL", "not a url"],
  ])("gives back no window when it %s", (_, url) => {
    expect(callerWindowOfSpotlight(url)).toStrictEqual(Option.none())
  })
})

describe("history mode's messages", () => {
  const throughThePort = <A, I>(schema: Schema.Codec<A, I>, message: A): A =>
    Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(Schema.encodeSync(schema)(message))))

  it("a search of the history alone reaches the background as sent", () => {
    const search: SpotlightClientMessage = {
      _tag: "Search",
      requestId: RequestId.make(1),
      windowId: WindowId.make(7),
      query: "katip",
      mode: "History",
    }

    expect(throughThePort(SpotlightClientMessage, search)).toStrictEqual(search)
  })

  it("the offer to turn on history search reaches Spotlight as sent", () => {
    const answer: SpotlightServerMessage = {
      _tag: "SearchResults",
      requestId: RequestId.make(1),
      results: [{ _tag: "TurnOnHistorySearch" }],
      spaceTheme: null,
    }

    expect(throughThePort(SpotlightServerMessage, answer)).toStrictEqual(answer)
  })
})
