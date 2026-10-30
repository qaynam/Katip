import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import {
  commandForDrop,
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

describe("一時タブをドラッグしたとき", () => {
  it("一時タブの間に落とすと、その位置へ並べ替える", () => {
    expect(drop(temporaryTab(1), belowTab(2))).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(1),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("自分自身の上下に落としても何も起きない", () => {
    expect(drop(temporaryTab(1), belowTab(1))).toBeNull()
  })

  it("ピン留めのフォルダ内に落とすと、その位置にピン留めする", () => {
    expect(drop(temporaryTab(1), pinnedTarget("folder", 2))).toStrictEqual({
      _tag: "PlaceTabInPinned",
      tabId: tabId(1),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 2 },
    })
  })

  it("Favorites に落とすと、その位置に Favorites として追加する", () => {
    expect(drop(temporaryTab(1), { _tag: "Favorites", slot: 3 })).toStrictEqual({
      _tag: "AddToFavorites",
      tabId: tabId(1),
      index: 3,
    })
  })

  it("Space の印の並びには落とせない", () => {
    expect(drop(temporaryTab(1), { _tag: "SpaceBar", slot: 0 })).toBeNull()
  })
})

describe("ピンをドラッグしたとき", () => {
  it("同じ親の中で後ろへ動かすと、自分が抜けた分を詰めた位置へ移す", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget(null, 3))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: null, index: 2 },
    })
  })

  it("同じ親の中で前へ動かすと、落とした位置へそのまま移す", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 3 } })

    expect(drop(source, pinnedTarget(null, 1))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: null, index: 1 },
    })
  })

  it("元の位置の前後の隙間に落としても何も起きない", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 2 } })

    expect(drop(source, pinnedTarget(null, 2))).toBeNull()
    expect(drop(source, pinnedTarget(null, 3))).toBeNull()
  })

  it("別のフォルダへ落とすと、その隙間の位置へ移す", () => {
    const source = pinnedItem("a", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget("folder", 1))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 1 },
    })
  })

  it("元の位置が分からないピンは、落とした隙間の位置へ移す", () => {
    const source = pinnedItem("a", { position: null })

    expect(drop(source, pinnedTarget("folder", 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("a"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 4 },
    })
  })

  it("開いているピンを一時タブへ落とすと、ピンを外してその位置の一時タブにする", () => {
    const source = pinnedItem("a", { openTabId: 7 })

    expect(drop(source, belowTab(2))).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(7),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("閉じたピンは一時タブへも Favorites へも落とせない", () => {
    const source = pinnedItem("a")

    expect(drop(source, belowTab(2))).toBeNull()
    expect(drop(source, { _tag: "Favorites", slot: 0 })).toBeNull()
  })

  it("開いているピンを Favorites へ落とすと、そのタブを Favorites に追加する", () => {
    const source = pinnedItem("a", { openTabId: 7 })

    expect(drop(source, { _tag: "Favorites", slot: 0 })).toStrictEqual({
      _tag: "AddToFavorites",
      tabId: tabId(7),
      index: 0,
    })
  })
})

describe("フォルダをドラッグしたとき", () => {
  it("別のフォルダの中に落とすと、そのフォルダの中の落とした位置へ移す", () => {
    const source = pinnedFolderSource("docs", { position: { parentId: null, index: 0 } })

    expect(drop(source, pinnedTarget("projects", 2))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("docs"),
      placement: { spaceId, parentId: bookmarkId("projects"), index: 2 },
    })
  })

  it("同じ親の中で後ろへ動かすと、自分が抜けた分を詰めた位置へ移す", () => {
    const source = pinnedFolderSource("docs", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("docs"),
      placement: { spaceId, parentId: null, index: 3 },
    })
  })

  it("自分自身の中には落とせない", () => {
    expect(drop(pinnedFolderSource("docs"), pinnedTarget("docs", 0))).toBeNull()
  })

  it("自分の中にあるフォルダの中には落とせない", () => {
    const source = pinnedFolderSource("docs", { descendantIds: ["minutes", "inbox"] })

    expect(drop(source, pinnedTarget("minutes", 0))).toBeNull()
    expect(drop(source, pinnedTarget("inbox", 0))).toBeNull()
  })

  it("一時タブ・Favorites・分割ビュー・Space の印には落とせない", () => {
    const source = pinnedFolderSource("docs")

    expect(drop(source, belowTab(2))).toBeNull()
    expect(drop(source, { _tag: "Favorites", slot: 0 })).toBeNull()
    expect(drop(source, splitWith(2))).toBeNull()
    expect(drop(source, { _tag: "SpaceBar", slot: 0 })).toBeNull()
  })
})

describe("Favorite をドラッグしたとき", () => {
  it("Favorites の中で後ろへ動かすと、詰めた位置へ並べ替える", () => {
    expect(drop(favorite(5, 0), { _tag: "Favorites", slot: 2 })).toStrictEqual({
      _tag: "MoveFavorite",
      tabId: tabId(5),
      toIndex: 1,
    })
  })

  it("元の位置に落としても何も起きない", () => {
    expect(drop(favorite(5, 1), { _tag: "Favorites", slot: 1 })).toBeNull()
  })

  it("ピン留めへ落とすと、その位置にピン留めする", () => {
    expect(drop(favorite(5, 0), pinnedTarget(null, 0))).toStrictEqual({
      _tag: "PlaceTabInPinned",
      tabId: tabId(5),
      placement: { spaceId, parentId: null, index: 0 },
    })
  })

  it("一時タブの末尾へ落とすと、表示中の Space の一時タブにする", () => {
    const target: DropTarget = { _tag: "Temporary", placement: { _tag: "Bottom" } }

    expect(drop(favorite(5, 0), target)).toStrictEqual({
      _tag: "PlaceTabInTemporary",
      tabId: tabId(5),
      spaceId,
      placement: { _tag: "Bottom" },
    })
  })
})

describe("タブを一時タブの行の中央に落としたとき", () => {
  it("落とした先のタブの右に並べて分割ビューにする", () => {
    expect(drop(temporaryTab(1), splitWith(2))).toStrictEqual({
      _tag: "SplitTabs",
      tabId: tabId(1),
      withTabId: tabId(2),
    })
  })

  it("開いているピンや Favorite も、そのタブを並べて分割ビューにする", () => {
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

  it("自分自身の行の中央に落としても何も起きない", () => {
    expect(drop(temporaryTab(2), splitWith(2))).toBeNull()
  })

  it("閉じたピンは分割ビューにできない", () => {
    expect(drop(pinnedItem("a"), splitWith(2))).toBeNull()
  })

  it("分割ビューの行は、さらに別のタブと分割ビューにはできない", () => {
    expect(drop(temporarySplit(9, 3, 4), splitWith(2))).toBeNull()
    expect(drop(pinnedSplit("split", { openSplitViewId: 9 }), splitWith(2))).toBeNull()
  })

  it("分割ビューを作れない環境では分割しない", () => {
    expect(drop(temporaryTab(1), splitWith(2), { canSplit: false })).toBeNull()
  })
})

describe("分割ビューを作れない環境で、分割の位置に落としたとき", () => {
  const outcomeOf = (source: DragSource, target: DropTarget) =>
    Option.getOrNull(dropOutcome(source, target, { spaceId, canSplit: false }))

  it("分割できたはずのタブなら、並べ替えずに対応していないことを知らせる", () => {
    expect(outcomeOf(temporaryTab(1), splitWith(2))).toStrictEqual({ _tag: "SplitUnsupported" })
  })

  it("対応していても分割にならないドロップは、知らせずに受け付けない", () => {
    expect(outcomeOf(temporaryTab(2), splitWith(2))).toBeNull()
    expect(outcomeOf(pinnedItem("a"), splitWith(2))).toBeNull()
  })

  it("分割の位置以外へのドロップは、いつも通りのコマンドになる", () => {
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

describe("一時タブの分割ビューの行をドラッグしたとき", () => {
  it("一時タブの別の位置に落とすと、2 つのタブを並べたまま行ごとその位置へ移す", () => {
    expect(drop(temporarySplit(9, 3, 4), belowTab(2))).toStrictEqual({
      _tag: "PlaceSplitInTemporary",
      splitViewId: splitViewId(9),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("自分の行の上下に落としても何も起きない", () => {
    expect(drop(temporarySplit(9, 3, 4), aboveTab(3))).toBeNull()
    expect(drop(temporarySplit(9, 3, 4), belowTab(4))).toBeNull()
  })

  it("ピン留めの任意の位置に落とすと、分割ビューのままその位置にピン留めする", () => {
    expect(drop(temporarySplit(9, 3, 4), pinnedTarget("folder", 2))).toStrictEqual({
      _tag: "PlaceSplitInPinned",
      splitViewId: splitViewId(9),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 2 },
    })
  })

  it("Favorites には落とせない", () => {
    expect(drop(temporarySplit(9, 3, 4), { _tag: "Favorites", slot: 0 })).toBeNull()
  })
})

describe("ピン留めした分割ビューをドラッグしたとき", () => {
  it("同じ親の中で後ろへ動かすと、自分が抜けた分を詰めた位置へ移す", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 4))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("split"),
      placement: { spaceId, parentId: null, index: 3 },
    })
  })

  it("元の位置の前後の隙間に落としても何も起きない", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget(null, 1))).toBeNull()
    expect(drop(source, pinnedTarget(null, 2))).toBeNull()
  })

  it("別のフォルダへ落とすと、その隙間の位置へ移す", () => {
    const source = pinnedSplit("split", { position: { parentId: null, index: 1 } })

    expect(drop(source, pinnedTarget("folder", 0))).toStrictEqual({
      _tag: "MovePinnedItem",
      bookmarkId: bookmarkId("split"),
      placement: { spaceId, parentId: bookmarkId("folder"), index: 0 },
    })
  })

  it("開いていれば、一時タブへ落とすとピンを外して分割ビューのままその位置に置く", () => {
    expect(drop(pinnedSplit("split", { openSplitViewId: 9 }), belowTab(2))).toStrictEqual({
      _tag: "PlaceSplitInTemporary",
      splitViewId: splitViewId(9),
      spaceId,
      placement: { _tag: "Below", tabId: tabId(2) },
    })
  })

  it("閉じていれば、一時タブへ落としても何も起きない", () => {
    expect(drop(pinnedSplit("split"), belowTab(2))).toBeNull()
  })

  it("Favorites には落とせない", () => {
    expect(
      drop(pinnedSplit("split", { openSplitViewId: 9 }), { _tag: "Favorites", slot: 0 }),
    ).toBeNull()
  })
})

describe("Space の印をドラッグしたとき", () => {
  it("印の並びの中で前へ動かすと、その位置へ並べ替える", () => {
    expect(drop(spaceMark("c", 2), { _tag: "SpaceBar", slot: 0 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("c"),
      toIndex: 0,
    })
  })

  it("末尾の隙間へ動かすと、最後の位置へ並べ替える", () => {
    expect(drop(spaceMark("a", 0), { _tag: "SpaceBar", slot: 3 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("a"),
      toIndex: 2,
    })
  })

  it("タブの並びには落とせない", () => {
    expect(drop(spaceMark("a", 0), belowTab(1))).toBeNull()
    expect(drop(spaceMark("a", 0), pinnedTarget(null, 0))).toBeNull()
  })
})

describe("edgeAt", () => {
  it("要素の上半分なら前、下半分なら後ろに入れる", () => {
    expect(edgeAt(9, 20)).toBe("before")
    expect(edgeAt(10, 20)).toBe("after")
  })
})

describe("一時タブの行に重ねたとき", () => {
  const row = { width: 200, height: 40 }

  it("分割ビューにできる行では、右寄りの上下中央に重ねると分割ビューにする", () => {
    expect(rowZoneAt({ x: 190, y: 20 }, row, true)).toBe("split")
    expect(rowZoneAt({ x: 70, y: 8 }, row, true)).toBe("split")
    expect(rowZoneAt({ x: 70, y: 32 }, row, true)).toBe("split")
  })

  it("分割ビューにできる行でも、左端に重ねると上下の半分で並べ替える", () => {
    expect(rowZoneAt({ x: 69, y: 19 }, row, true)).toBe("before")
    expect(rowZoneAt({ x: 69, y: 21 }, row, true)).toBe("after")
  })

  it("分割ビューにできる行でも、上下の端に重ねると前後に並べ替える", () => {
    expect(rowZoneAt({ x: 190, y: 7.9 }, row, true)).toBe("before")
    expect(rowZoneAt({ x: 190, y: 32.1 }, row, true)).toBe("after")
  })

  it("分割ビューにできない行では、上半分なら前、下半分なら後ろに並べ替える", () => {
    expect(rowZoneAt({ x: 190, y: 19.9 }, row, false)).toBe("before")
    expect(rowZoneAt({ x: 190, y: 20 }, row, false)).toBe("after")
  })
})

describe("フォルダの見出しに重ねたとき", () => {
  const folder = {
    bookmarkId: bookmarkId("folder"),
    position: { parentId: null, index: 2 },
    childCount: 3,
  }

  it("上端に重ねるとフォルダの前に入れる", () => {
    expect(folderDropTarget(folder, folderZoneAt(2, 32, false))).toStrictEqual(
      pinnedTarget(null, 2),
    )
  })

  it("中央に重ねるとフォルダの中の末尾に入れる", () => {
    expect(folderDropTarget(folder, folderZoneAt(16, 32, false))).toStrictEqual(
      pinnedTarget("folder", 3),
    )
  })

  it("閉じたフォルダの下端に重ねるとフォルダの後ろに入れる", () => {
    expect(folderDropTarget(folder, folderZoneAt(30, 32, false))).toStrictEqual(
      pinnedTarget(null, 3),
    )
  })

  it("開いたフォルダの下端に重ねるとフォルダの中の先頭に入れる", () => {
    expect(folderDropTarget(folder, folderZoneAt(30, 32, true))).toStrictEqual(
      pinnedTarget("folder", 0),
    )
  })
})
