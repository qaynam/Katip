import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { gridIndexAfter } from "./grid-navigation"

// 0  1  2
// 3  4  5
// 6  7
const shape = { count: 8, columns: 3 }

describe("Moving focus within a grid", () => {
  it("moves right with → and left with ←", () => {
    expect([
      gridIndexAfter("ArrowRight", 4, shape),
      gridIndexAfter("ArrowLeft", 4, shape),
    ]).toStrictEqual([Option.some(5), Option.some(3)])
  })

  it("wraps left and right moves past the end of a row into the adjacent row", () => {
    expect([
      gridIndexAfter("ArrowRight", 2, shape),
      gridIndexAfter("ArrowLeft", 3, shape),
    ]).toStrictEqual([Option.some(3), Option.some(2)])
  })

  it("moves down a row with ↓ and up a row with ↑, staying in the same column", () => {
    expect([
      gridIndexAfter("ArrowDown", 1, shape),
      gridIndexAfter("ArrowUp", 4, shape),
    ]).toStrictEqual([Option.some(4), Option.some(1)])
  })

  it("stays put on moves that would leave the grid", () => {
    expect([
      gridIndexAfter("ArrowLeft", 0, shape),
      gridIndexAfter("ArrowRight", 7, shape),
      gridIndexAfter("ArrowUp", 2, shape),
      gridIndexAfter("ArrowDown", 5, shape),
    ]).toStrictEqual([Option.some(0), Option.some(7), Option.some(2), Option.some(5)])
  })

  it("moves to the first item with Home and to the last with End", () => {
    expect([gridIndexAfter("Home", 4, shape), gridIndexAfter("End", 4, shape)]).toStrictEqual([
      Option.some(0),
      Option.some(7),
    ])
  })

  it("returns no position for keys that don't move focus", () => {
    expect(gridIndexAfter("Enter", 4, shape)).toStrictEqual(Option.none())
  })
})
