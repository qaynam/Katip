import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import {
  favoriteView,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
  temporarySplit,
  temporaryTab,
} from "../testing/view-builders"
import { activeTabIdsIn, withActiveTab } from "./active-tab"

const open = (id: number) => openPinnedTab(tabView(id))

/**
 * A tab in every place one can show: temporary tab 1, temporary split 2 and 3, pin 4, split pin
 * 5 and 6 inside a collapsed folder that also peeks it out, other Space's tab 7, Favorite 8.
 * Tab 1 is active.
 */
const view = sidebarView({
  spaces: [
    spaceView("work", {
      pinnedNodes: [
        pinnedItem("pin", { openTab: open(4) }),
        pinnedFolder("folder", {
          isExpanded: false,
          children: [
            pinnedSplit("split", [
              pinnedItem("left", { openTab: open(5) }),
              pinnedItem("right", { openTab: open(6) }),
            ]),
          ],
          peekedItems: [
            pinnedSplit("split", [
              pinnedItem("left", { openTab: open(5) }),
              pinnedItem("right", { openTab: open(6) }),
            ]),
          ],
        }),
      ],
      temporaryEntries: [
        temporaryTab(tabView(1, { isActive: true })),
        temporarySplit(1, tabView(2), tabView(3)),
      ],
    }),
    spaceView("hobby", { temporaryTabs: [tabView(7)] }),
  ],
  favorites: [favoriteView(8), favoriteView(9, { openTab: null })],
})

describe("withActiveTab", () => {
  it.each([1, 2, 3, 4, 7, 8])("makes tab %i the only active one", (id) => {
    expect(activeTabIdsIn(withActiveTab(view, TabId.make(id)))).toStrictEqual([TabId.make(id)])
  })

  it("makes a split pin's tab active both in its folder and where the folder peeks it out", () => {
    expect(activeTabIdsIn(withActiveTab(view, TabId.make(6)))).toStrictEqual([
      TabId.make(6),
      TabId.make(6),
    ])
  })

  it("shows no tab active for a tab the view doesn't show", () => {
    expect(activeTabIdsIn(withActiveTab(view, TabId.make(99)))).toStrictEqual([])
  })
})
