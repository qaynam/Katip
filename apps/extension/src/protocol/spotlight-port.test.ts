import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { WindowId } from "#platform/browser"
import { RequestId } from "./sidebar-port"
import {
  callerWindowOfSpotlight,
  SPOTLIGHT_PAGE_PATH,
  SpotlightClientMessage,
  spotlightPageUrl,
  SpotlightServerMessage,
} from "./spotlight-port"

const ORIGIN = "chrome-extension://katip-test/"

describe("the Spotlight page's URL", () => {
  it("points to the extension's Spotlight page", () => {
    const url = spotlightPageUrl(ORIGIN, WindowId.make(7))

    expect(url.startsWith(`${ORIGIN}${SPOTLIGHT_PAGE_PATH}?`)).toBe(true)
  })

  it("gives back the window that opened Spotlight", () => {
    const url = spotlightPageUrl(ORIGIN, WindowId.make(7))

    expect(callerWindowOfSpotlight(url)).toStrictEqual(Option.some(WindowId.make(7)))
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
