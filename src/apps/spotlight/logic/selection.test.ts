import { describe, expect, it } from "vitest"
import { stepSelection } from "./selection"

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
