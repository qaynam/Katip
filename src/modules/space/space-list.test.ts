import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceColor, SpaceId, SpaceName, type Space } from "./space"
import {
  addSpace,
  moveSpace,
  recolorSpace,
  removeSpace,
  renameSpace,
  type SpaceList,
} from "./space-list"

const spaceId = (value: string) => SpaceId.make(value)
const spaceName = (value: string) => SpaceName.make(value)

const space = (id: string, overrides: Partial<Omit<Space, "id">> = {}): Space => ({
  id: spaceId(id),
  name: spaceName(id),
  color: "grey",
  ...overrides,
})

const idsOf = (spaces: SpaceList) => spaces.map((s) => s.id)

describe("SpaceName", () => {
  const decode = Schema.decodeUnknownOption(SpaceName)

  it("前後の空白を取り除いた名前として受け付ける", () => {
    expect(decode("  仕事  ")).toStrictEqual(decode("仕事"))
  })

  it("空白だけの名前は受け付けない", () => {
    expect(decode("   ")._tag).toBe("None")
  })
})

describe("addSpace", () => {
  it("一覧の末尾に追加される", () => {
    const spaces = [space("a"), space("b")]

    const added = addSpace(spaces, { id: spaceId("c") })

    expect(idsOf(added)).toStrictEqual(["a", "b", "c"])
  })

  it("名前を省略すると、既存の名前と重複しない連番の名前が付く", () => {
    const spaces = [space("a", { name: spaceName("スペース 2") })]

    const added = addSpace(spaces, { id: spaceId("b") })

    expect(added.at(-1)?.name).toBe("スペース 3")
  })

  it("色を省略すると、まだ使われていない色のうちパレット順で最初のものが付く", () => {
    const spaces = [space("a", { color: "grey" }), space("b", { color: "red" })]

    const added = addSpace(spaces, { id: spaceId("c") })

    expect(added.at(-1)?.color).toBe("blue")
  })

  it("すべての色が使われているときは、パレットを一巡した色が付く", () => {
    const spaces = SpaceColor.literals.map((color) => space(color, { color }))

    const added = addSpace(spaces, { id: spaceId("next") })

    expect(added.at(-1)?.color).toBe(SpaceColor.literals[0])
  })

  it("名前と色を指定するとその値で作られる", () => {
    const added = addSpace([], { id: spaceId("a"), name: spaceName("趣味"), color: "pink" })

    expect(added).toStrictEqual([{ id: "a", name: "趣味", color: "pink" }])
  })
})

describe("renameSpace", () => {
  it("指定した Space の名前だけが変わる", () => {
    const spaces = [space("a"), space("b")]

    const renamed = renameSpace(spaces, spaceId("b"), spaceName("読書"))

    expect(Result.getOrThrow(renamed).map((s) => s.name)).toStrictEqual(["a", "読書"])
  })

  it("存在しない Space を指定すると SpaceNotFound になる", () => {
    const renamed = renameSpace([space("a")], spaceId("missing"), spaceName("x"))

    expect(Result.isFailure(renamed) && renamed.failure._tag).toBe("SpaceNotFound")
  })
})

describe("recolorSpace", () => {
  it("指定した Space の色だけが変わる", () => {
    const spaces = [space("a"), space("b")]

    const recolored = recolorSpace(spaces, spaceId("a"), "green")

    expect(Result.getOrThrow(recolored).map((s) => s.color)).toStrictEqual(["green", "grey"])
  })

  it("存在しない Space を指定すると SpaceNotFound になる", () => {
    const recolored = recolorSpace([space("a")], spaceId("missing"), "green")

    expect(Result.isFailure(recolored) && recolored.failure._tag).toBe("SpaceNotFound")
  })
})

describe("removeSpace", () => {
  it("指定した Space が一覧から消え、残りの順序は保たれる", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const removed = removeSpace(spaces, spaceId("b"))

    expect(idsOf(Result.getOrThrow(removed))).toStrictEqual(["a", "c"])
  })

  it("最後の 1 つは削除できない", () => {
    const removed = removeSpace([space("a")], spaceId("a"))

    expect(Result.isFailure(removed) && removed.failure._tag).toBe("LastSpaceRemoval")
  })

  it("存在しない Space を指定すると SpaceNotFound になる", () => {
    const removed = removeSpace([space("a"), space("b")], spaceId("missing"))

    expect(Result.isFailure(removed) && removed.failure._tag).toBe("SpaceNotFound")
  })
})

describe("moveSpace", () => {
  it("指定した位置へ移動し、他の Space の相対順序は保たれる", () => {
    const spaces = [space("a"), space("b"), space("c"), space("d")]

    const moved = moveSpace(spaces, spaceId("a"), 2)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["b", "c", "a", "d"])
  })

  it("範囲外の位置を指定すると末尾へ移動する", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const moved = moveSpace(spaces, spaceId("a"), 99)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["b", "c", "a"])
  })

  it("負の位置を指定すると先頭へ移動する", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const moved = moveSpace(spaces, spaceId("c"), -1)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["c", "a", "b"])
  })

  it("存在しない Space を指定すると SpaceNotFound になる", () => {
    const moved = moveSpace([space("a")], spaceId("missing"), 0)

    expect(Result.isFailure(moved) && moved.failure._tag).toBe("SpaceNotFound")
  })
})
