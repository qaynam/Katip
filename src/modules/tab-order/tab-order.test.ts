import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import { displayOrder, moveIndexFor, type DisplayPlacement } from "./tab-order"

const ids = (...values: ReadonlyArray<number>) => values.map((value) => TabId.make(value))

const above = (tabId: number): DisplayPlacement => ({ _tag: "Above", tabId: TabId.make(tabId) })
const below = (tabId: number): DisplayPlacement => ({ _tag: "Below", tabId: TabId.make(tabId) })

// Chrome の index 順に [固定タブ 1][一時 2, 3, 4][別 Space の 5][移動するタブ 6]
const windowTabs = ids(1, 2, 3, 4, 5, 6)
const spaceTabs = ids(2, 3, 4, 6)

const finalOrderAfterMove = (target: number) => {
  const rest = windowTabs.filter((tab) => tab !== TabId.make(6))
  return [...rest.slice(0, target), TabId.make(6), ...rest.slice(target)]
}

describe("displayOrder", () => {
  it("新しいタブを上に表示する設定では、Chrome の並びを逆順にして表示する", () => {
    expect(displayOrder(spaceTabs, { newestOnTop: true })).toStrictEqual(ids(6, 4, 3, 2))
  })

  it("通常の設定では、Chrome の並びのまま表示する", () => {
    expect(displayOrder(spaceTabs, { newestOnTop: false })).toStrictEqual(ids(2, 3, 4, 6))
  })
})

describe("moveIndexFor", () => {
  describe("Chrome の並びのまま表示しているとき", () => {
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

    it("指定したタブの上に置くと、Chrome でもそのタブの直前に並ぶ", () => {
      expect(move(above(3))).toStrictEqual(Option.some(ids(1, 2, 6, 3, 4, 5)))
    })

    it("指定したタブの下に置くと、Chrome でもそのタブの直後に並ぶ", () => {
      expect(move(below(3))).toStrictEqual(Option.some(ids(1, 2, 3, 6, 4, 5)))
    })

    it("一覧の先頭に置くと、その Space の最初のタブの直前に並ぶ", () => {
      expect(move({ _tag: "Top" })).toStrictEqual(Option.some(ids(1, 6, 2, 3, 4, 5)))
    })

    it("一覧の末尾に置くと、その Space の最後のタブの直後に並ぶ", () => {
      expect(move({ _tag: "Bottom" })).toStrictEqual(Option.some(ids(1, 2, 3, 4, 6, 5)))
    })
  })

  describe("新しいタブを上に表示しているとき", () => {
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

    it("画面上で指定したタブの上に置くと、Chrome ではそのタブの直後に並ぶ", () => {
      expect(move(above(3))).toStrictEqual(Option.some(ids(1, 2, 3, 6, 4, 5)))
    })

    it("画面上で指定したタブの下に置くと、Chrome ではそのタブの直前に並ぶ", () => {
      expect(move(below(3))).toStrictEqual(Option.some(ids(1, 2, 6, 3, 4, 5)))
    })

    it("画面上の先頭に置くと、Chrome ではその Space の最後のタブの直後に並ぶ", () => {
      expect(move({ _tag: "Top" })).toStrictEqual(Option.some(ids(1, 2, 3, 4, 6, 5)))
    })

    it("画面上の末尾に置くと、Chrome ではその Space の最初のタブの直前に並ぶ", () => {
      expect(move({ _tag: "Bottom" })).toStrictEqual(Option.some(ids(1, 6, 2, 3, 4, 5)))
    })
  })

  it("基準のタブが見つからなければ移動しない", () => {
    const index = moveIndexFor({
      windowTabs,
      spaceTabs,
      moving: ids(6),
      placement: above(99),
      newestOnTop: false,
    })

    expect(index).toStrictEqual(Option.none())
  })

  it("自分自身を基準にしたときは移動しない", () => {
    const index = moveIndexFor({
      windowTabs,
      spaceTabs,
      moving: ids(6),
      placement: above(6),
      newestOnTop: false,
    })

    expect(index).toStrictEqual(Option.none())
  })

  it("Space に他のタブが無いときは移動しない", () => {
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

describe("分割ビューのタブ", () => {
  // Chrome の index 順に [固定 1][一時 2][分割 3, 4][一時 5]
  const windowWithSplit = ids(1, 2, 3, 4, 5)
  const spaceWithSplit = ids(2, 3, 4, 5)
  const splitPair = ids(3, 4)
  const unitOf = (tabId: TabId) => (splitPair.includes(tabId) ? splitPair : [tabId])

  const finalOrder = (moving: ReadonlyArray<TabId>, target: number) => {
    const rest = windowWithSplit.filter((tab) => !moving.includes(tab))
    return [...rest.slice(0, target), ...moving, ...rest.slice(target)]
  }

  it("分割の右のタブの上に置いても、分割の 2 つの間には割り込まない", () => {
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

  it("分割の左のタブの下に置いても、分割の 2 つの後ろに並ぶ", () => {
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

  it("分割の 2 つを一緒に動かすと、並びを保ったまま指定した位置に入る", () => {
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
