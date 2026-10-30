import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { WindowId } from "#platform/browser"
import { callerWindowOfSpotlight, SPOTLIGHT_PAGE_PATH, spotlightPageUrl } from "./spotlight-port"

const ORIGIN = "chrome-extension://katip-test/"

describe("Spotlight のページの URL", () => {
  it("拡張の Spotlight のページを指す", () => {
    const url = spotlightPageUrl(ORIGIN, WindowId.make(7))

    expect(url.startsWith(`${ORIGIN}${SPOTLIGHT_PAGE_PATH}?`)).toBe(true)
  })

  it("開いたウィンドウを読み戻せる", () => {
    const url = spotlightPageUrl(ORIGIN, WindowId.make(7))

    expect(callerWindowOfSpotlight(url)).toStrictEqual(Option.some(WindowId.make(7)))
  })

  it.each([
    ["ウィンドウの指定が無い", `${ORIGIN}${SPOTLIGHT_PAGE_PATH}`],
    ["ウィンドウの指定が数でない", `${ORIGIN}${SPOTLIGHT_PAGE_PATH}?windowId=abc`],
    ["URL として読めない", "not a url"],
  ])("%s URL からは、開いたウィンドウを読み取れない", (_, url) => {
    expect(callerWindowOfSpotlight(url)).toStrictEqual(Option.none())
  })
})
