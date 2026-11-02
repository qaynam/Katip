import { describe, expect, it } from "vitest"
import { selectionStepOf, stepSelection } from "./selection"

describe("選択の移動", () => {
  it("次へ進む", () => {
    expect(stepSelection(0, 3, 1)).toBe(1)
  })

  it("最後の次は先頭へ回る", () => {
    expect(stepSelection(2, 3, 1)).toBe(0)
  })

  it("先頭の前は最後へ回る", () => {
    expect(stepSelection(0, 3, -1)).toBe(2)
  })

  it("候補が無ければ先頭のまま", () => {
    expect(stepSelection(0, 0, 1)).toBe(0)
  })
})

describe("選択を動かすキー", () => {
  const press = (key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  })

  it("↓ と Ctrl+N で次へ、↑ と Ctrl+P で前へ動かす", () => {
    expect(
      [
        press("ArrowDown"),
        press("n", { ctrlKey: true }),
        press("ArrowUp"),
        press("p", { ctrlKey: true }),
      ].map(selectionStepOf),
    ).toStrictEqual([1, 1, -1, -1])
  })

  it("Ctrl を押していない N や、⌘ と合わせた N では動かさない", () => {
    expect(
      [press("n"), press("n", { ctrlKey: true, metaKey: true })].map(selectionStepOf),
    ).toStrictEqual([null, null])
  })
})
