import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { detectSwipe, neighborSpaceId } from "./swipe"

const longAgo = Number.POSITIVE_INFINITY

describe("detectSwipe", () => {
  it("左へ十分に強く払うと前の Space へ戻る", () => {
    expect(Option.getOrNull(detectSwipe({ deltaX: -26, deltaY: 0 }, longAgo))).toBe("previous")
  })

  it("右へ十分に強く払うと次の Space へ進む", () => {
    expect(Option.getOrNull(detectSwipe({ deltaX: 26, deltaY: 3 }, longAgo))).toBe("next")
  })

  it("横移動が 25px 以下の弱い動きは無視する", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 25, deltaY: 0 }, longAgo))).toBe(true)
  })

  it("縦の動きの方が大きければ、縦スクロールとして無視する", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 40, deltaY: -41 }, longAgo))).toBe(true)
  })

  it("直前の切替から 400ms 経つまでは次の切替をしない", () => {
    expect(Option.isNone(detectSwipe({ deltaX: 80, deltaY: 0 }, 399))).toBe(true)
    expect(Option.isSome(detectSwipe({ deltaX: 80, deltaY: 0 }, 400))).toBe(true)
  })
})

describe("neighborSpaceId", () => {
  const spaces = ["a", "b", "c"].map((id) => ({ id: SpaceId.make(id) }))
  const neighbor = (activeId: string, direction: "previous" | "next") =>
    Option.getOrNull(neighborSpaceId(spaces, SpaceId.make(activeId), direction))

  it("隣の Space を返す", () => {
    expect(neighbor("b", "next")).toBe("c")
    expect(neighbor("b", "previous")).toBe("a")
  })

  it("端では反対側の端へ循環する", () => {
    expect(neighbor("c", "next")).toBe("a")
    expect(neighbor("a", "previous")).toBe("c")
  })

  it("Space が 1 つだけなら切り替え先は無い", () => {
    const only = [{ id: SpaceId.make("a") }]

    expect(Option.isNone(neighborSpaceId(only, SpaceId.make("a"), "next"))).toBe(true)
  })

  it("アクティブな Space が一覧に無ければ切り替え先は無い", () => {
    expect(neighbor("missing", "next")).toBeNull()
  })
})
