import { describe, expect, it } from "vitest"
import { mergeNewestFirst, sortLiveItems } from "./live-item-order"
import type { LiveItem, LiveSource } from "./live-source"

const github: LiveSource = { _tag: "GitHub", query: "mentioned" }
const gmail: LiveSource = { _tag: "Gmail", accountIndex: 0, label: null }

const item = (id: string, fields: Partial<LiveItem> = {}): LiveItem => ({
  id,
  title: id,
  subtitle: "",
  url: `https://example.com/${id}`,
  updatedAt: 0,
  ...fields,
})

const ids = (items: ReadonlyArray<LiveItem>) => items.map((each) => each.id)

describe("複数の一覧をまとめる", () => {
  it("先頭どうしの更新時刻を比べて、新しい方から交互に取り出す", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 30 }), item("b", { updatedAt: 10 })],
      [item("c", { updatedAt: 20 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "c", "b"])
  })

  it("それぞれの一覧の中の並びは、時刻と食い違っていても崩さない", () => {
    const merged = mergeNewestFirst([[item("a", { updatedAt: 10 }), item("b", { updatedAt: 50 })]])

    expect(ids(merged)).toStrictEqual(["a", "b"])
  })

  it("先頭の時刻が同じなら、先に渡した一覧から取り出す", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 10 })],
      [item("b", { updatedAt: 10 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "b"])
  })

  it("両方に現れた項目は、先に取り出した 1 つだけを残す", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 30 }), item("shared", { updatedAt: 20 })],
      [item("shared", { updatedAt: 20 }), item("b", { updatedAt: 10 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "shared", "b"])
  })

  it("一覧が無いか空なら空になる", () => {
    expect([mergeNewestFirst([]), mergeNewestFirst([[], []])]).toStrictEqual([[], []])
  })
})

describe("並べ方", () => {
  const sourceOrder = [
    item("1", { title: "Beta", subtitle: "katip-dev/web#3", updatedAt: 300 }),
    item("2", { title: "alpha", subtitle: "katip-dev/api#8", updatedAt: 200 }),
    item("3", { title: "Gamma", subtitle: "katip-dev/web#1", updatedAt: 100 }),
  ]

  it("新しい順は、取得元が新しい順に並べた順のまま", () => {
    expect(ids(sortLiveItems(sourceOrder, "newest", github))).toStrictEqual(["1", "2", "3"])
  })

  it("古い順は、取得元の並びの逆", () => {
    expect(ids(sortLiveItems(sourceOrder, "oldest", github))).toStrictEqual(["3", "2", "1"])
  })

  it("件名順は、大文字と小文字を区別せずに並べる", () => {
    expect(ids(sortLiveItems(sourceOrder, "title", github))).toStrictEqual(["2", "1", "3"])
  })

  it("件名順で、件名の中の数字は数の大きさで比べる", () => {
    const items = [item("10", { title: "PR 10" }), item("9", { title: "PR 9" })]

    expect(ids(sortLiveItems(items, "title", github))).toStrictEqual(["9", "10"])
  })

  it("件名が同じ項目は、新しい順に並べる", () => {
    const items = [item("new", { title: "Same" }), item("old", { title: "same" })]

    expect(ids(sortLiveItems(items, "title", github))).toStrictEqual(["new", "old"])
  })

  it("取得元順では、GitHub はリポジトリごとにまとめ、その中は新しい順に並べる", () => {
    expect(ids(sortLiveItems(sourceOrder, "source", github))).toStrictEqual(["2", "1", "3"])
  })

  it("取得元順では、Gmail は差出人ごとにまとめ、その中は新しい順に並べる", () => {
    const mails = [
      item("m1", { subtitle: "佐藤 花子", updatedAt: 300 }),
      item("m2", { subtitle: "Billing", updatedAt: 200 }),
      item("m3", { subtitle: "佐藤 花子", updatedAt: 100 }),
    ]

    expect(ids(sortLiveItems(mails, "source", gmail))).toStrictEqual(["m2", "m1", "m3"])
  })

  it("Gmail の差出人は、番号のような文字を含んでも別の差出人として分ける", () => {
    const mails = [item("a", { subtitle: "Team #2" }), item("b", { subtitle: "Team #1" })]

    expect(ids(sortLiveItems(mails, "source", gmail))).toStrictEqual(["b", "a"])
  })

  it("項目が無ければ、どの並べ方でも空", () => {
    expect(
      (["newest", "oldest", "title", "source"] as const).map((sort) =>
        sortLiveItems([], sort, github),
      ),
    ).toStrictEqual([[], [], [], []])
  })
})
