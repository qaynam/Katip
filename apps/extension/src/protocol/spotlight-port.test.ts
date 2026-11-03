import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { WindowId } from "#platform/browser"
import { callerWindowOfSpotlight, SPOTLIGHT_PAGE_PATH, spotlightPageUrl } from "./spotlight-port"

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
