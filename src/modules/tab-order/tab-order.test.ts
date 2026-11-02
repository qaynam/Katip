import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import { displayOrder, moveIndexFor, type DisplayPlacement } from "./tab-order"

const ids = (...values: ReadonlyArray<number>) => values.map((value) => TabId.make(value))

const above = (tabId: number): DisplayPlacement => ({ _tag: "Above", tabId: TabId.make(tabId) })
const below = (tabId: number): DisplayPlacement => ({ _tag: "Below", tabId: TabId.make(tabId) })

// In Chrome's index order: [Chrome-pinned 1][temporary 2, 3, 4][other Space's 5][moving tab 6]
const windowTabs = ids(1, 2, 3, 4, 5, 6)
const spaceTabs = ids(2, 3, 4, 6)

const finalOrderAfterMove = (target: number) => {
  const rest = windowTabs.filter((tab) => tab !== TabId.make(6))
  return [...rest.slice(0, target), TabId.make(6), ...rest.slice(target)]
}

describe("displayOrder", () => {
  it("with newest tabs on top, shows Chrome's order reversed", () => {
    expect(displayOrder(spaceTabs, { newestOnTop: true })).toStrictEqual(ids(6, 4, 3, 2))
  })

  it("otherwise, shows Chrome's order as is", () => {
    expect(displayOrder(spaceTabs, { newestOnTop: false })).toStrictEqual(ids(2, 3, 4, 6))
  })
})

describe("moveIndexFor", () => {
  describe("when shown in Chrome's order", () => {
    const move = (placement: DisplayPlacement) =>
      Option.map(
        moveIndexFor({
          windowTabs,
          spaceTabs,
          moving: ids(6),
          placement,
          newestOnTop: false,
        }),
        finalOrderAfterMove,
      )

    it("placing a tab above another puts it right before that tab in Chrome too", () => {
      expect(move(above(3))).toStrictEqual(Option.some(ids(1, 2, 6, 3, 4, 5)))
    })

    it("placing a tab below another puts it right after that tab in Chrome too", () => {
      expect(move(below(3))).toStrictEqual(Option.some(ids(1, 2, 3, 6, 4, 5)))
    })

    it("placing a tab at the top puts it right before the Space's first tab", () => {
      expect(move({ _tag: "Top" })).toStrictEqual(Option.some(ids(1, 6, 2, 3, 4, 5)))
    })

    it("placing a tab at the bottom puts it right after the Space's last tab", () => {
      expect(move({ _tag: "Bottom" })).toStrictEqual(Option.some(ids(1, 2, 3, 4, 6, 5)))
    })
  })

  describe("when shown with newest tabs on top", () => {
    const move = (placement: DisplayPlacement) =>
      Option.map(
        moveIndexFor({
          windowTabs,
          spaceTabs,
          moving: ids(6),
          placement,
          newestOnTop: true,
        }),
        finalOrderAfterMove,
      )

    it("placing a tab above another on screen puts it right after that tab in Chrome", () => {
      expect(move(above(3))).toStrictEqual(Option.some(ids(1, 2, 3, 6, 4, 5)))
    })

    it("placing a tab below another on screen puts it right before that tab in Chrome", () => {
      expect(move(below(3))).toStrictEqual(Option.some(ids(1, 2, 6, 3, 4, 5)))
    })

    it("placing a tab at the top on screen puts it right after the Space's last tab in Chrome", () => {
      expect(move({ _tag: "Top" })).toStrictEqual(Option.some(ids(1, 2, 3, 4, 6, 5)))
    })

    it("placing a tab at the bottom on screen puts it right before the Space's first tab in Chrome", () => {
      expect(move({ _tag: "Bottom" })).toStrictEqual(Option.some(ids(1, 6, 2, 3, 4, 5)))
    })
  })

  it("doesn't move when the anchor tab isn't found", () => {
    const index = moveIndexFor({
      windowTabs,
      spaceTabs,
      moving: ids(6),
      placement: above(99),
      newestOnTop: false,
    })

    expect(index).toStrictEqual(Option.none())
  })

  it("doesn't move when the tab is its own anchor", () => {
    const index = moveIndexFor({
      windowTabs,
      spaceTabs,
      moving: ids(6),
      placement: above(6),
      newestOnTop: false,
    })

    expect(index).toStrictEqual(Option.none())
  })

  it("doesn't move when the Space has no other tabs", () => {
    const index = moveIndexFor({
      windowTabs,
      spaceTabs: ids(6),
      moving: ids(6),
      placement: { _tag: "Top" },
      newestOnTop: false,
    })

    expect(index).toStrictEqual(Option.none())
  })
})

describe("split view tabs", () => {
  // In Chrome's index order: [Chrome-pinned 1][temporary 2][split 3, 4][temporary 5]
  const windowWithSplit = ids(1, 2, 3, 4, 5)
  const spaceWithSplit = ids(2, 3, 4, 5)
  const splitPair = ids(3, 4)
  const unitOf = (tabId: TabId) => (splitPair.includes(tabId) ? splitPair : [tabId])

  const finalOrder = (moving: ReadonlyArray<TabId>, target: number) => {
    const rest = windowWithSplit.filter((tab) => !moving.includes(tab))
    return [...rest.slice(0, target), ...moving, ...rest.slice(target)]
  }

  it("placing a tab above the right half of a split doesn't put it between the two", () => {
    const index = moveIndexFor({
      windowTabs: windowWithSplit,
      spaceTabs: spaceWithSplit,
      moving: ids(5),
      placement: above(4),
      newestOnTop: false,
      unitOf,
    })

    expect(Option.map(index, (i) => finalOrder(ids(5), i))).toStrictEqual(
      Option.some(ids(1, 2, 5, 3, 4)),
    )
  })

  it("placing a tab below the left half of a split puts it after both", () => {
    const index = moveIndexFor({
      windowTabs: windowWithSplit,
      spaceTabs: spaceWithSplit,
      moving: ids(2),
      placement: below(3),
      newestOnTop: false,
      unitOf,
    })

    expect(Option.map(index, (i) => finalOrder(ids(2), i))).toStrictEqual(
      Option.some(ids(1, 3, 4, 2, 5)),
    )
  })

  it("moving both tabs of a split together keeps them in order at the given position", () => {
    const index = moveIndexFor({
      windowTabs: windowWithSplit,
      spaceTabs: spaceWithSplit,
      moving: splitPair,
      placement: { _tag: "Bottom" },
      newestOnTop: false,
      unitOf,
    })

    expect(Option.map(index, (i) => finalOrder(splitPair, i))).toStrictEqual(
      Option.some(ids(1, 2, 5, 3, 4)),
    )
  })
})
