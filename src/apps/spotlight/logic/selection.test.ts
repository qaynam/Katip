import { describe, expect, it } from "vitest"
import { selectionStepOf, stepSelection } from "./selection"

describe("stepSelection", () => {
  it("moves to the next candidate", () => {
    expect(stepSelection(0, 3, 1)).toBe(1)
  })

  it("wraps from the last candidate to the first", () => {
    expect(stepSelection(2, 3, 1)).toBe(0)
  })

  it("wraps from the first candidate back to the last", () => {
    expect(stepSelection(0, 3, -1)).toBe(2)
  })

  it("stays at the top when there are no candidates", () => {
    expect(stepSelection(0, 0, 1)).toBe(0)
  })
})

describe("selectionStepOf", () => {
  const press = (key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  })

  it("moves down with ↓ and Ctrl+N, and up with ↑ and Ctrl+P", () => {
    expect(
      [
        press("ArrowDown"),
        press("n", { ctrlKey: true }),
        press("ArrowUp"),
        press("p", { ctrlKey: true }),
      ].map(selectionStepOf),
    ).toStrictEqual([1, 1, -1, -1])
  })

  it("doesn't move for N without Ctrl, or for N with ⌘ as well", () => {
    expect(
      [press("n"), press("n", { ctrlKey: true, metaKey: true })].map(selectionStepOf),
    ).toStrictEqual([null, null])
  })
})
