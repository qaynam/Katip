import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { gridIndexAfter } from "./grid-navigation"

// 0  1  2
// 3  4  5
// 6  7
const shape = { count: 8, columns: 3 }

describe("格子の中のフォーカスの移動", () => {
  it("→ で右隣、← で左隣へ動く", () => {
    expect([
      gridIndexAfter("ArrowRight", 4, shape),
      gridIndexAfter("ArrowLeft", 4, shape),
    ]).toStrictEqual([Option.some(5), Option.some(3)])
  })

  it("左右の移動は、行の端を越えて隣の行の端へ続く", () => {
    expect([
      gridIndexAfter("ArrowRight", 2, shape),
      gridIndexAfter("ArrowLeft", 3, shape),
    ]).toStrictEqual([Option.some(3), Option.some(2)])
  })

  it("↓ で 1 行下、↑ で 1 行上の同じ列へ動く", () => {
    expect([
      gridIndexAfter("ArrowDown", 1, shape),
      gridIndexAfter("ArrowUp", 4, shape),
    ]).toStrictEqual([Option.some(4), Option.some(1)])
  })

  it("格子の外へ出る向きには動かない", () => {
    expect([
      gridIndexAfter("ArrowLeft", 0, shape),
      gridIndexAfter("ArrowRight", 7, shape),
      gridIndexAfter("ArrowUp", 2, shape),
      gridIndexAfter("ArrowDown", 5, shape),
    ]).toStrictEqual([Option.some(0), Option.some(7), Option.some(2), Option.some(5)])
  })

  it("Home で先頭、End で末尾へ動く", () => {
    expect([gridIndexAfter("Home", 4, shape), gridIndexAfter("End", 4, shape)]).toStrictEqual([
      Option.some(0),
      Option.some(7),
    ])
  })

  it("フォーカスを動かすキーでなければ、位置を返さない", () => {
    expect(gridIndexAfter("Enter", 4, shape)).toStrictEqual(Option.none())
  })
})
