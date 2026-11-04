import { describe, expect, it } from "vitest"
import { Option } from "effect"
import {
  FavoriteId,
  followTabOrder,
  indexBetween,
  insertFavorite,
  moveFavorite,
  pinnedIndexOf,
  type FavoriteList,
} from "./favorites"

const id = (name: string) => FavoriteId.make(name)

const listOf = (...names: ReadonlyArray<string>): FavoriteList =>
  names.map((name) => ({ id: id(name), url: `https://${name}.example/`, title: name }))

const namesOf = (list: FavoriteList) => list.map((favorite) => favorite.id)

describe("insertFavorite", () => {
  it("puts the favorite at the index, or at the end when the index is past it", () => {
    const mail = { id: id("mail"), url: "https://mail.example/", title: "Mail" }

    expect([
      namesOf(insertFavorite(listOf("a", "b"), mail, 1)),
      namesOf(insertFavorite(listOf("a", "b"), mail, 9)),
    ]).toStrictEqual([
      ["a", "mail", "b"],
      ["a", "b", "mail"],
    ])
  })
})

describe("moveFavorite", () => {
  it("moves the favorite to the index counted without it", () => {
    expect([
      namesOf(moveFavorite(listOf("a", "b", "c"), id("a"), 2)),
      namesOf(moveFavorite(listOf("a", "b", "c"), id("c"), 0)),
    ]).toStrictEqual([
      ["b", "c", "a"],
      ["c", "a", "b"],
    ])
  })

  it("leaves the list as it is when the favorite is not in it", () => {
    expect(namesOf(moveFavorite(listOf("a", "b"), id("gone"), 0))).toStrictEqual(["a", "b"])
  })
})

describe("indexBetween", () => {
  it("is right after the favorite before, else right before the favorite after, else the end", () => {
    const list = listOf("a", "b", "c")

    expect([
      indexBetween(list, Option.some(id("a")), Option.some(id("c"))),
      indexBetween(list, Option.none(), Option.some(id("b"))),
      indexBetween(list, Option.some(id("gone")), Option.none()),
    ]).toStrictEqual([1, 1, 3])
  })
})

describe("pinnedIndexOf", () => {
  it("counts the favorites before it that are open in the window", () => {
    const list = listOf("a", "b", "c", "d")

    expect(pinnedIndexOf(list, id("d"), new Set([id("a"), id("c")]))).toBe(2)
  })
})

describe("followTabOrder", () => {
  it("moves the favorite whose tab moved to follow the tab order, keeping closed ones in place", () => {
    const list = listOf("a", "closed", "b", "c")

    expect(namesOf(followTabOrder(list, id("c"), [id("a"), id("c"), id("b")]))).toStrictEqual([
      "a",
      "c",
      "closed",
      "b",
    ])
  })

  it("puts a favorite moved to the front right before the favorite of the next tab", () => {
    const list = listOf("closed", "a", "b")

    expect(namesOf(followTabOrder(list, id("b"), [id("b"), id("a")]))).toStrictEqual([
      "closed",
      "b",
      "a",
    ])
  })

  it("leaves the list as it is when it already follows the tab order", () => {
    const list = listOf("a", "closed", "b")

    expect(followTabOrder(list, id("b"), [id("a"), id("b")])).toBe(list)
  })
})
