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

describe("Chrome のウィンドウの変換", () => {
  it("ID を持たないウィンドウは変換しない", () => {
    const window = fromChromeWindow(chromeWindow({ id: undefined }))

    assert.isTrue(Option.isNone(window))
  })

  it("ID を持つウィンドウはその ID とフォーカスの有無を持つ", () => {
    const window = fromChromeWindow(chromeWindow({ id: 10, focused: false }))

    assert.deepStrictEqual(
      Option.map(window, ({ id, focused }) => [id, focused]),
      Option.some([WindowId.make(10), false]),
    )
  })

  it("位置と大きさがすべて分かるウィンドウはそれを持つ", () => {
    const window = fromChromeWindow(chromeWindow({ left: 100, top: 50, width: 1200, height: 800 }))

    assert.deepStrictEqual(
      Option.flatMap(window, ({ bounds }) => bounds),
      Option.some({ left: 100, top: 50, width: 1200, height: 800 }),
    )
  })

  it("位置と大きさのどれかが分からなければ、位置と大きさを持たない", () => {
    const window = fromChromeWindow(chromeWindow({ left: undefined }))

    assert.deepStrictEqual(
      Option.flatMap(window, ({ bounds }) => bounds),
      Option.none(),
    )
  })
})
