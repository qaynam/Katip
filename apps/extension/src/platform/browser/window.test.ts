import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { WindowId } from "./ids"
import { fromChromeWindow } from "./window"

const chromeWindow = (overrides: Partial<chrome.windows.Window> = {}): chrome.windows.Window => ({
  id: 10,
  focused: true,
  alwaysOnTop: false,
  incognito: false,
  type: "normal",
  state: "normal",
  left: 100,
  top: 50,
  width: 1200,
  height: 800,
  ...overrides,
})

describe("converting a Chrome window", () => {
  it("a window without an ID is not converted", () => {
    const window = fromChromeWindow(chromeWindow({ id: undefined }))

    assert.isTrue(Option.isNone(window))
  })

  it("a window with an ID keeps that ID and whether it has focus", () => {
    const window = fromChromeWindow(chromeWindow({ id: 10, focused: false }))

    assert.deepStrictEqual(
      Option.map(window, ({ id, focused }) => [id, focused]),
      Option.some([WindowId.make(10), false]),
    )
  })

  it("a window with its full position and size keeps them as bounds", () => {
    const window = fromChromeWindow(chromeWindow({ left: 100, top: 50, width: 1200, height: 800 }))

    assert.deepStrictEqual(
      Option.flatMap(window, ({ bounds }) => bounds),
      Option.some({ left: 100, top: 50, width: 1200, height: 800 }),
    )
  })

  it("a window missing any of its position and size has no bounds", () => {
    const window = fromChromeWindow(chromeWindow({ left: undefined }))

    assert.deepStrictEqual(
      Option.flatMap(window, ({ bounds }) => bounds),
      Option.none(),
    )
  })
})
