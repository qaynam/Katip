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

describe("merging several lists", () => {
  it("repeatedly takes whichever list head was updated most recently", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 30 }), item("b", { updatedAt: 10 })],
      [item("c", { updatedAt: 20 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "c", "b"])
  })

  it("keeps the order within each list even when it disagrees with the times", () => {
    const merged = mergeNewestFirst([[item("a", { updatedAt: 10 }), item("b", { updatedAt: 50 })]])

    expect(ids(merged)).toStrictEqual(["a", "b"])
  })

  it("on equal head times, takes from the list passed first", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 10 })],
      [item("b", { updatedAt: 10 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "b"])
  })

  it("keeps only the first taken of an item that appears in both", () => {
    const merged = mergeNewestFirst([
      [item("a", { updatedAt: 30 }), item("shared", { updatedAt: 20 })],
      [item("shared", { updatedAt: 20 }), item("b", { updatedAt: 10 })],
    ])

    expect(ids(merged)).toStrictEqual(["a", "shared", "b"])
  })

  it("is empty when there are no lists or they are empty", () => {
    expect([mergeNewestFirst([]), mergeNewestFirst([[], []])]).toStrictEqual([[], []])
  })
})

describe("sort orders", () => {
  const sourceOrder = [
    item("1", { title: "Beta", subtitle: "katip-dev/web#3", updatedAt: 300 }),
    item("2", { title: "alpha", subtitle: "katip-dev/api#8", updatedAt: 200 }),
    item("3", { title: "Gamma", subtitle: "katip-dev/web#1", updatedAt: 100 }),
  ]

  it("newest keeps the source's newest-first order", () => {
    expect(ids(sortLiveItems(sourceOrder, "newest", github))).toStrictEqual(["1", "2", "3"])
  })

  it("oldest reverses the source's order", () => {
    expect(ids(sortLiveItems(sourceOrder, "oldest", github))).toStrictEqual(["3", "2", "1"])
  })

  it("title order ignores case", () => {
    expect(ids(sortLiveItems(sourceOrder, "title", github))).toStrictEqual(["2", "1", "3"])
  })

  it("title order compares digits in titles by numeric value", () => {
    const items = [item("10", { title: "PR 10" }), item("9", { title: "PR 9" })]

    expect(ids(sortLiveItems(items, "title", github))).toStrictEqual(["9", "10"])
  })

  it("items with the same title stay newest first", () => {
    const items = [item("new", { title: "Same" }), item("old", { title: "same" })]

    expect(ids(sortLiveItems(items, "title", github))).toStrictEqual(["new", "old"])
  })

  it("source order groups GitHub items by repository, newest first within each", () => {
    expect(ids(sortLiveItems(sourceOrder, "source", github))).toStrictEqual(["2", "1", "3"])
  })

  it("source order groups Gmail items by sender, newest first within each", () => {
    const mails = [
      item("m1", { subtitle: "Hanako Sato", updatedAt: 300 }),
      item("m2", { subtitle: "Billing", updatedAt: 200 }),
      item("m3", { subtitle: "Hanako Sato", updatedAt: 100 }),
    ]

    expect(ids(sortLiveItems(mails, "source", gmail))).toStrictEqual(["m2", "m1", "m3"])
  })

  it("tells Gmail senders apart even when they contain something like a number", () => {
    const mails = [item("a", { subtitle: "Team #2" }), item("b", { subtitle: "Team #1" })]

    expect(ids(sortLiveItems(mails, "source", gmail))).toStrictEqual(["b", "a"])
  })

  it("is empty in every order when there are no items", () => {
    expect(
      (["newest", "oldest", "title", "source"] as const).map((sort) =>
        sortLiveItems([], sort, github),
      ),
    ).toStrictEqual([[], [], [], []])
  })
})
