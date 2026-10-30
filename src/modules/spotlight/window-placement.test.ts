import { describe, expect, it } from "vitest"
import { spotlightBoundsOver } from "./window-placement"

describe("Spotlight のウィンドウの置き場所", () => {
  describe("十分に大きいウィンドウの上に開くとき", () => {
    const caller = { left: 100, top: 50, width: 1440, height: 900 }

    it("幅 640px、高さ 440px で開く", () => {
      const { width, height } = spotlightBoundsOver(caller)

      expect([width, height]).toStrictEqual([640, 440])
    })

    it("左右の中央に置く", () => {
      const { left, width } = spotlightBoundsOver(caller)

      expect(left - caller.left).toBe(caller.left + caller.width - (left + width))
    })

    it("上下の中央より上に寄せ、上端からは離す", () => {
      const { top, height } = spotlightBoundsOver(caller)
      const above = top - caller.top
      const below = caller.top + caller.height - (top + height)

      expect(above).toBeGreaterThan(0)
      expect(above).toBeLessThan(below)
    })
  })

  describe("小さいウィンドウの上に開くとき", () => {
    it("ウィンドウからはみ出さないよう縮める", () => {
      const caller = { left: 0, top: 0, width: 600, height: 400 }

      const bounds = spotlightBoundsOver(caller)

      expect(bounds.left).toBeGreaterThanOrEqual(caller.left)
      expect(bounds.top).toBeGreaterThanOrEqual(caller.top)
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(caller.left + caller.width)
      expect(bounds.top + bounds.height).toBeLessThanOrEqual(caller.top + caller.height)
    })

    it("使えなくなるほどは縮めない", () => {
      const bounds = spotlightBoundsOver({ left: 0, top: 0, width: 200, height: 150 })

      expect([bounds.width, bounds.height]).toStrictEqual([360, 240])
    })
  })

  it("位置と大きさは整数になる", () => {
    const bounds = spotlightBoundsOver({ left: 0, top: 0, width: 1001, height: 777 })

    expect(Object.values(bounds).every(Number.isInteger)).toBe(true)
  })
})
