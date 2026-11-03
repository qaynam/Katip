import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { pageSideOfDrop } from "./page-drop"

// A 1300 px wide window whose side panel takes 300 px on the right leaves a 1000 px page
const window = { left: 100, top: 50, width: 1300, height: 800 }
const panelOnTheRight = { panelLeft: 1100, panelRight: 1400 }
const panelOnTheLeft = { panelLeft: 100, panelRight: 400 }

describe("pageSideOfDrop", () => {
  it.each([
    [150, "Left"],
    [433, "Left"],
    [767, "Right"],
    [1050, "Right"],
  ] as const)("with the side panel on the right, a drop at x=%d splits to the %s", (x, side) => {
    expect(pageSideOfDrop({ x, y: 400, ...panelOnTheRight }, window)).toStrictEqual(
      Option.some(side),
    )
  })

  it("leaves a drop in the middle third of the page alone", () => {
    expect(pageSideOfDrop({ x: 600, y: 400, ...panelOnTheRight }, window)).toStrictEqual(
      Option.none(),
    )
  })

  it("with the side panel on the left, takes the page to be the part right of it", () => {
    expect([
      pageSideOfDrop({ x: 450, y: 400, ...panelOnTheLeft }, window),
      pageSideOfDrop({ x: 1350, y: 400, ...panelOnTheLeft }, window),
    ]).toStrictEqual([Option.some("Left"), Option.some("Right")])
  })

  it.each([
    ["left of the window", 50, 400],
    ["above the window", 150, 20],
    ["below the window", 150, 900],
    ["over the side panel", 1200, 400],
  ])("leaves a drop %s alone", (_, x, y) => {
    expect(pageSideOfDrop({ x, y, ...panelOnTheRight }, window)).toStrictEqual(Option.none())
  })
})
