import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { BookmarkId, TabId } from "#platform/browser"
import {
  commandForDrop,
  edgeAt,
  folderDropTarget,
  folderZoneAt,
  type DragSource,
  type DropTarget,
  type PinnedPosition,
} from "./drag-drop"

const spaceId = SpaceId.make("work")
const tabId = (value: number) => TabId.make(value)
const bookmarkId = (value: string) => BookmarkId.make(value)

const temporaryTab = (id: number): DragSource => ({ _tag: "TemporaryTab", tabId: tabId(id) })
const pinnedItem = (
  id: string,
  options: { readonly openTabId?: number; readonly position?: PinnedPosition | null } = {},
): DragSource => ({
  _tag: "PinnedItem",
  bookmarkId: bookmarkId(id),
  openTabId: options.openTabId === undefined ? null : tabId(options.openTabId),
  position: options.position === undefined ? { parentId: null, index: 0 } : options.position,
})
const favorite = (id: number, index: number): DragSource => ({
  _tag: "Favorite",
  tabId: tabId(id),
  index,
})
const chip = (id: string, index: number): DragSource => ({
  _tag: "SpaceChip",
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

const drop = (source: DragSource, target: DropTarget) =>
  Option.getOrNull(commandForDrop(source, target, spaceId))

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

  it("Space のスイッチャーには落とせない", () => {
    expect(drop(temporaryTab(1), { _tag: "Switcher", slot: 0 })).toBeNull()
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

describe("Space のチップをドラッグしたとき", () => {
  it("スイッチャーの中で前へ動かすと、その位置へ並べ替える", () => {
    expect(drop(chip("c", 2), { _tag: "Switcher", slot: 0 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("c"),
      toIndex: 0,
    })
  })

  it("末尾の隙間へ動かすと、最後の位置へ並べ替える", () => {
    expect(drop(chip("a", 0), { _tag: "Switcher", slot: 3 })).toStrictEqual({
      _tag: "MoveSpace",
      spaceId: SpaceId.make("a"),
      toIndex: 2,
    })
  })

  it("タブの並びには落とせない", () => {
    expect(drop(chip("a", 0), belowTab(1))).toBeNull()
    expect(drop(chip("a", 0), pinnedTarget(null, 0))).toBeNull()
  })
})

describe("edgeAt", () => {
  it("要素の上半分なら前、下半分なら後ろに入れる", () => {
    expect(edgeAt(9, 20)).toBe("before")
    expect(edgeAt(10, 20)).toBe("after")
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
