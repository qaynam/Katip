import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { BookmarkId, SplitViewId, TabId, WindowId } from "#platform/browser"
import {
  commandForDrop,
  commandForPageDrop,
  dropOutcome,
  edgeAt,
  folderDropTarget,
  folderZoneAt,
  rowZoneAt,
  type DragSource,
  type DropTarget,
  type PinnedPosition,
} from "./drag-drop"

const spaceId = SpaceId.make("work")
const tabId = (value: number) => TabId.make(value)
const bookmarkId = (value: string) => BookmarkId.make(value)

const splitViewId = (value: number) => SplitViewId.make(value)

const temporaryTab = (id: number): DragSource => ({ _tag: "TemporaryTab", tabId: tabId(id) })
const temporarySplit = (id: number, left: number, right: number): DragSource => ({
  _tag: "TemporarySplit",
  splitViewId: splitViewId(id),
  tabIds: [tabId(left), tabId(right)],
})
const pinnedItem = (
  id: string,
  options: { readonly openTabId?: number; readonly position?: PinnedPosition | null } = {},
): DragSource => ({
  _tag: "PinnedItem",
  bookmarkId: bookmarkId(id),
  openTabId: options.openTabId === undefined ? null : tabId(options.openTabId),
  position: options.position === undefined ? { parentId: null, index: 0 } : options.position,
})
const pinnedSplit = (
  id: string,
  options: { readonly openSplitViewId?: number; readonly position?: PinnedPosition } = {},
): DragSource => ({
  _tag: "PinnedSplit",
  bookmarkId: bookmarkId(id),
  openSplitViewId:
    options.openSplitViewId === undefined ? null : splitViewId(options.openSplitViewId),
  position: options.position ?? { parentId: null, index: 0 },
})
const pinnedFolderSource = (
  id: string,
  options: {
    readonly position?: PinnedPosition
    readonly descendantIds?: ReadonlyArray<string>
  } = {},
): DragSource => ({
  _tag: "PinnedFolder",
  bookmarkId: bookmarkId(id),
  position: options.position ?? { parentId: null, index: 0 },
  selfAndDescendantIds: [id, ...(options.descendantIds ?? [])].map(bookmarkId),
})
const favorite = (id: number, index: number): DragSource => ({
  _tag: "Favorite",
  tabId: tabId(id),
  index,
})
const spaceMark = (id: string, index: number): DragSource => ({
  _tag: "SpaceMark",
  spaceId: SpaceId.make(id),
  index,
})

const pinnedTarget = (parentId: string | null, slot: number): DropTarget => ({
  _tag: "Pinned",
  parentId: parentId === null ? null : bookmarkId(parentId),
  slot,
})
const belowTab = (id: number): DropTarget => ({
  _tag: "Temporary",
  placement: { _tag: "Below", tabId: tabId(id) },
})
const aboveTab = (id: number): DropTarget => ({
  _tag: "Temporary",
  placement: { _tag: "Above", tabId: tabId(id) },
})
const splitWith = (id: number): DropTarget => ({ _tag: "SplitWith", tabId: tabId(id) })

const drop = (
  source: DragSource,
  target: DropTarget,
  options: { readonly canSplit?: boolean } = {},
) =>
  Option.getOrNull(commandForDrop(source, target, { spaceId, canSplit: options.canSplit ?? true }))

describe("Dragging a temporary tab", () => {
  it("reorders it to where it is dropped among the temporary tabs", () => {
    expect(drop(temporaryTab(1), belowTab(2))).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(1),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("does nothing when dropped right above or below itself", () => {
    expect(drop(temporaryTab(1), belowTab(1))).toBeNull()
  })

  it("pins it at the drop position inside a pinned folder", () => {
    expect(drop(temporaryTab(1), pinnedTarget("folder", 2))).toStrictEqual({
      _tag: "PlaceTabInPinned",
      tabId: tabId(1),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 2 },
    })
  })

  it("adds it to Favorites at the drop position", () => {
    expect(drop(temporaryTab(1), { _tag: "Favorites", slot: 3 })).toStrictEqual({
      _tag: "AddToFavorites",
      tabId: tabId(1),
      index: 3,
    })
  })

  it("can't be dropped on the Space marks", () => {
    expect(drop(temporaryTab(1), { _tag: "SpaceBar", slot: 0 })).toBeNull()
  })
})

describe("Dragging a pin", () => {
  it("moves it to the drop position shifted back by one when moved later within the same parent", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget(null, 3))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: null, index: 2 },
    })
  })

  it("moves it to the drop position as is when moved earlier within the same parent", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 3 } })

    expect(drop(source, pinnedTarget(null, 1))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: null, index: 1 },
    })
  })

  it("does nothing when dropped in the gap right before or after its own place", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 2 } })

    expect(drop(source, pinnedTarget(null, 2))).toBeNull()
    expect(drop(source, pinnedTarget(null, 3))).toBeNull()
  })

  it("moves it to the gap it is dropped in within another folder", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget("folder", 1))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 1 },
    })
  })

  it("moves a pin with an unknown position to the gap it is dropped in", () => {
    const source = pinnedItem("a", { position: null })

    expect(drop(source, pinnedTarget("folder", 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 4 },
    })
  })

  it("unpins an open pin dropped into temporary tabs and places it there as a temporary tab", () => {
    const source = pinnedItem("a", { openTabId: 7 })

    expect(drop(source, belowTab(2))).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(7),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("can't drop a closed pin into temporary tabs or Favorites", () => {
    const source = pinnedItem("a")

    expect(drop(source, belowTab(2))).toBeNull()
    expect(drop(source, { _tag: "Favorites", slot: 0 })).toBeNull()
  })

  it("adds the tab of an open pin dropped on Favorites to Favorites", () => {
    const source = pinnedItem("a", { openTabId: 7 })

    expect(drop(source, { _tag: "Favorites", slot: 0 })).toStrictEqual({
      _tag: "AddToFavorites",
      tabId: tabId(7),
      index: 0,
    })
  })
})

describe("Dragging a folder", () => {
  it("moves it to the drop position inside another folder", () => {
    const source = pinnedFolderSource("docs", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget("projects", 2))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("docs"),
      placement: { spaceId, parentId: bookmarkId("projects"), index: 2 },
    })
  })

  it("moves it to the drop position shifted back by one when moved later within the same parent", () => {
    const source = pinnedFolderSource("docs", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("docs"),
      placement: { spaceId, parentId: null, index: 3 },
    })
  })

  it("can't be dropped into itself", () => {
    expect(drop(pinnedFolderSource("docs"), pinnedTarget("docs", 0))).toBeNull()
  })

  it("can't be dropped into a folder inside itself", () => {
    const source = pinnedFolderSource("docs", { descendantIds: ["minutes", "inbox"] })

    expect(drop(source, pinnedTarget("minutes", 0))).toBeNull()
    expect(drop(source, pinnedTarget("inbox", 0))).toBeNull()
  })

  it("can't be dropped on temporary tabs, Favorites, split views, or Space marks", () => {
    const source = pinnedFolderSource("docs")

    expect(drop(source, belowTab(2))).toBeNull()
    expect(drop(source, { _tag: "Favorites", slot: 0 })).toBeNull()
    expect(drop(source, splitWith(2))).toBeNull()
    expect(drop(source, { _tag: "SpaceBar", slot: 0 })).toBeNull()
  })
})

describe("Dragging a Favorite", () => {
  it("reorders it to the drop position shifted back by one when moved later within Favorites", () => {
    expect(drop(favorite(5, 0), { _tag: "Favorites", slot: 2 })).toStrictEqual({
      _tag: "MoveFavorite",
      tabId: tabId(5),
      toIndex: 1,
    })
  })

  it("does nothing when dropped on its own place", () => {
    expect(drop(favorite(5, 1), { _tag: "Favorites", slot: 1 })).toBeNull()
  })

  it("pins it at the drop position when dropped on pinned tabs", () => {
    expect(drop(favorite(5, 0), pinnedTarget(null, 0))).toStrictEqual({
      _tag: "PlaceTabInPinned",
      tabId: tabId(5),
      placement: { spaceId, parentId: null, index: 0 },
    })
  })

  it("makes it a temporary tab of the active Space when dropped at the end of temporary tabs", () => {
    const target: DropTarget = { _tag: "Temporary", placement: { _tag: "Bottom" } }

    expect(drop(favorite(5, 0), target)).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(5),
      spaceId,
      placement: { _tag: "Bottom" },
    })
  })
})

describe("Dropping a tab on the middle of a temporary tab row", () => {
  it("creates a split view with the dropped tab to the right of the target tab", () => {
    expect(drop(temporaryTab(1), splitWith(2))).toStrictEqual({
      _tag: "SplitTabs",
      tabId: tabId(1),
      withTabId: tabId(2),
    })
  })

  it("creates a split view with the tab of an open pin or a Favorite too", () => {
    expect(drop(pinnedItem("a", { openTabId: 7 }), splitWith(2))).toStrictEqual({
      _tag: "SplitTabs",
      tabId: tabId(7),
      withTabId: tabId(2),
    })
    expect(drop(favorite(5, 0), splitWith(2))).toStrictEqual({
      _tag: "SplitTabs",
      tabId: tabId(5),
      withTabId: tabId(2),
    })
  })

  it("does nothing when dropped on the middle of its own row", () => {
    expect(drop(temporaryTab(2), splitWith(2))).toBeNull()
  })

  it("can't create a split view from a closed pin", () => {
    expect(drop(pinnedItem("a"), splitWith(2))).toBeNull()
  })

  it("can't split a split view row with yet another tab", () => {
    expect(drop(temporarySplit(9, 3, 4), splitWith(2))).toBeNull()
    expect(drop(pinnedSplit("split", { openSplitViewId: 9 }), splitWith(2))).toBeNull()
  })

  it("doesn't split where split views aren't available", () => {
    expect(drop(temporaryTab(1), splitWith(2), { canSplit: false })).toBeNull()
  })
})

describe("Dropping on the split zone where split views aren't available", () => {
  const outcomeOf = (source: DragSource, target: DropTarget) =>
    Option.getOrNull(dropOutcome(source, target, { spaceId, canSplit: false }))

  it("reports the lack of support instead of reordering when the tab could have been split", () => {
    expect(outcomeOf(temporaryTab(1), splitWith(2))).toStrictEqual({ _tag: "SplitUnsupported" })
  })

  it("silently rejects drops that wouldn't split even with support", () => {
    expect(outcomeOf(temporaryTab(2), splitWith(2))).toBeNull()
    expect(outcomeOf(pinnedItem("a"), splitWith(2))).toBeNull()
  })

  it("gives the usual command for drops outside the split zone", () => {
    expect(outcomeOf(temporaryTab(1), belowTab(2))).toStrictEqual({
      _tag: "Run",
      command: {
        _tag: "PlaceTabInTemporary",
        tabId: tabId(1),
        spaceId,
        placement: { _tag: "Below", tabId: tabId(2) },
      },
    })
  })
})

describe("Dragging a temporary split view row", () => {
  it("moves the whole row, with both tabs still side by side, to another position among temporary tabs", () => {
    expect(drop(temporarySplit(9, 3, 4), belowTab(2))).toStrictEqual({
      _tag: "PlaceSplitInTemporary",
      splitViewId: splitViewId(9),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("does nothing when dropped right above or below its own row", () => {
    expect(drop(temporarySplit(9, 3, 4), aboveTab(3))).toBeNull()
    expect(drop(temporarySplit(9, 3, 4), belowTab(4))).toBeNull()
  })

  it("pins it as a split view at any drop position in pinned tabs", () => {
    expect(drop(temporarySplit(9, 3, 4), pinnedTarget("folder", 2))).toStrictEqual({
      _tag: "PlaceSplitInPinned",
      splitViewId: splitViewId(9),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 2 },
    })
  })

  it("can't be dropped on Favorites", () => {
    expect(drop(temporarySplit(9, 3, 4), { _tag: "Favorites", slot: 0 })).toBeNull()
  })
})

describe("Dragging a pinned split view", () => {
  it("moves it to the drop position shifted back by one when moved later within the same parent", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("split"),
      placement: { spaceId, parentId: null, index: 3 },
    })
  })

  it("does nothing when dropped in the gap right before or after its own place", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 1))).toBeNull()
    expect(drop(source, pinnedTarget(null, 2))).toBeNull()
  })

  it("moves it to the gap it is dropped in within another folder", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget("folder", 0))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("split"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 0 },
    })
  })

  it("unpins it and places it there as a split view when it is open and dropped into temporary tabs", () => {
    expect(drop(pinnedSplit("split", { openSplitViewId: 9 }), belowTab(2))).toStrictEqual({
      _tag: "PlaceSplitInTemporary",
      splitViewId: splitViewId(9),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("does nothing when it is closed and dropped into temporary tabs", () => {
    expect(drop(pinnedSplit("split"), belowTab(2))).toBeNull()
  })

  it("can't be dropped on Favorites", () => {
    expect(
      drop(pinnedSplit("split", { openSplitViewId: 9 }), { _tag: "Favorites", slot: 0 }),
    ).toBeNull()
  })
})

describe("Dragging a Space mark", () => {
  it("reorders it to the drop position when moved earlier among the marks", () => {
    expect(drop(spaceMark("c", 2), { _tag: "SpaceBar", slot: 0 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("c"),
      toIndex: 0,
    })
  })

  it("reorders it to the last position when moved to the gap at the end", () => {
    expect(drop(spaceMark("a", 0), { _tag: "SpaceBar", slot: 3 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("a"),
      toIndex: 2,
    })
  })

  it("can't be dropped among tabs", () => {
    expect(drop(spaceMark("a", 0), belowTab(1))).toBeNull()
    expect(drop(spaceMark("a", 0), pinnedTarget(null, 0))).toBeNull()
  })
})

describe("edgeAt", () => {
  it("inserts before in the element's top half and after in its bottom half", () => {
    expect(edgeAt(9, 20)).toBe("before")
    expect(edgeAt(10, 20)).toBe("after")
  })
})

describe("Hovering over a temporary tab row", () => {
  const row = { width: 200, height: 40 }

  it("splits when over the vertical middle toward the right of a row that can be split", () => {
    expect(rowZoneAt({ x: 190, y: 20 }, row, true)).toBe("split")
    expect(rowZoneAt({ x: 70, y: 8 }, row, true)).toBe("split")
    expect(rowZoneAt({ x: 70, y: 32 }, row, true)).toBe("split")
  })

  it("reorders by the top or bottom half when over the left part, even on a row that can be split", () => {
    expect(rowZoneAt({ x: 69, y: 19 }, row, true)).toBe("before")
    expect(rowZoneAt({ x: 69, y: 21 }, row, true)).toBe("after")
  })

  it("reorders before or after when over the top or bottom edge, even on a row that can be split", () => {
    expect(rowZoneAt({ x: 190, y: 7.9 }, row, true)).toBe("before")
    expect(rowZoneAt({ x: 190, y: 32.1 }, row, true)).toBe("after")
  })

  it("reorders before in the top half and after in the bottom half of a row that can't be split", () => {
    expect(rowZoneAt({ x: 190, y: 19.9 }, row, false)).toBe("before")
    expect(rowZoneAt({ x: 190, y: 20 }, row, false)).toBe("after")
  })
})

describe("Hovering over a folder header", () => {
  const folder = {
    bookmarkId: bookmarkId("folder"),
    position: { parentId: null, index: 2 },
    childCount: 3,
  }

  it("inserts before the folder when over its top edge", () => {
    expect(folderDropTarget(folder, folderZoneAt(2, 32, false))).toStrictEqual(
      pinnedTarget(null, 2),
    )
  })

  it("inserts at the end inside the folder when over its middle", () => {
    expect(folderDropTarget(folder, folderZoneAt(16, 32, false))).toStrictEqual(
      pinnedTarget("folder", 3),
    )
  })

  it("inserts after a collapsed folder when over its bottom edge", () => {
    expect(folderDropTarget(folder, folderZoneAt(30, 32, false))).toStrictEqual(
      pinnedTarget(null, 3),
    )
  })

  it("inserts at the start inside an expanded folder when over its bottom edge", () => {
    expect(folderDropTarget(folder, folderZoneAt(30, 32, true))).toStrictEqual(
      pinnedTarget("folder", 0),
    )
  })
})

describe("Letting go outside the side panel", () => {
  const windowId = WindowId.make(1)
  // A 300 × 800 side panel whose top left is at (1100, 80) on screen
  const panel = { origin: { x: 1100, y: 80 }, size: { width: 300, height: 800 } }
  const overThePage = { at: { x: 400, y: 300 }, dropEffect: "none" }

  it("asks to split an open tab with the shown tab, with where it was let go and the panel's edges", () => {
    expect(commandForPageDrop(temporaryTab(1), overThePage, panel, windowId)).toStrictEqual(
      Option.some({
        _tag: "SplitWithShownTab",
        tabId: tabId(1),
        windowId,
        x: 400,
        y: 300,
        panelLeft: 1100,
        panelRight: 1400,
      }),
    )
  })

  it.each([
    ["an open pin", pinnedItem("p", { openTabId: 2 }), 2],
    ["a Favorite", favorite(3, 0), 3],
  ])("asks the same for %s", (_, source, expectedTabId) => {
    expect(
      Option.map(commandForPageDrop(source, overThePage, panel, windowId), (command) =>
        command._tag === "SplitWithShownTab" ? command.tabId : null,
      ),
    ).toStrictEqual(Option.some(tabId(expectedTabId)))
  })

  it.each([
    ["a closed pin", pinnedItem("p")],
    ["a split view", temporarySplit(1, 2, 3)],
    ["a folder", pinnedFolderSource("f")],
    ["a Space mark", spaceMark("s", 0)],
  ])("asks nothing for %s, which has no single open tab", (_, source) => {
    expect(commandForPageDrop(source, overThePage, panel, windowId)).toStrictEqual(Option.none())
  })

  it("asks nothing when the pointer is still over the side panel", () => {
    const overThePanel = { at: { x: 1200, y: 300 }, dropEffect: "none" }

    expect(commandForPageDrop(temporaryTab(1), overThePanel, panel, windowId)).toStrictEqual(
      Option.none(),
    )
  })

  it("asks nothing when the page took the drop", () => {
    const takenByThePage = { at: { x: 400, y: 300 }, dropEffect: "move" }

    expect(commandForPageDrop(temporaryTab(1), takenByThePage, panel, windowId)).toStrictEqual(
      Option.none(),
    )
  })
})
