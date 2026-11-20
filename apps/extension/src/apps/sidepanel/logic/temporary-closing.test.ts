import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import { tabView, temporarySplit, temporaryTab } from "../testing/view-builders"
import { otherTemporaryTabs, temporaryTabsBelow } from "./temporary-closing"

// Shown top to bottom: tab 1, the split of tabs 2 and 3, tab 4
const entries = [
  temporaryTab(tabView(1)),
  temporarySplit(9, tabView(2), tabView(3)),
  temporaryTab(tabView(4)),
]
const ids = (...numbers: ReadonlyArray<number>) => numbers.map((n) => TabId.make(n))

describe("otherTemporaryTabs", () => {
  it("is every temporary tab but the one", () => {
    expect(otherTemporaryTabs(entries, TabId.make(4))).toStrictEqual(ids(1, 2, 3))
  })

  it("keeps both tabs of a split view, which form one row", () => {
    expect(otherTemporaryTabs(entries, TabId.make(3))).toStrictEqual(ids(1, 4))
  })

  it("is none for a tab that isn't a temporary tab", () => {
    expect(otherTemporaryTabs(entries, TabId.make(7))).toStrictEqual([])
  })
})

describe("temporaryTabsBelow", () => {
  it("is the tabs of the rows shown under the tab's row, split views included", () => {
    expect(temporaryTabsBelow(entries, TabId.make(1))).toStrictEqual(ids(2, 3, 4))
  })

  it("is none for the bottom row", () => {
    expect(temporaryTabsBelow(entries, TabId.make(4))).toStrictEqual([])
  })
})
