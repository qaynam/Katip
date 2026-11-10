import { describe, expect, it } from "vitest"
import { spotlightBoundsOver } from "./window-placement"

describe("Spotlight window placement", () => {
  describe("over a large enough window", () => {
    const caller = { left: 100, top: 50, width: 1440, height: 900 }

    it("opens 640px wide and 440px high at the normal size", () => {
      const { width, height } = spotlightBoundsOver(caller, "Normal")

      expect([width, height]).toStrictEqual([640, 440])
    })

    it("opens smaller at the compact size and larger at the large size", () => {
      const sizes = (["Compact", "Large"] as const).map((size) => {
        const { width, height } = spotlightBoundsOver(caller, size)
        return [width, height]
      })

      expect(sizes).toStrictEqual([
        [560, 360],
        [780, 560],
      ])
    })

    it("is centered horizontally", () => {
      const { left, width } = spotlightBoundsOver(caller, "Normal")

      expect(left - caller.left).toBe(caller.left + caller.width - (left + width))
    })

    it("sits above vertical center, clear of the top edge", () => {
      const { top, height } = spotlightBoundsOver(caller, "Normal")
      const above = top - caller.top
      const below = caller.top + caller.height - (top + height)

      expect(above).toBeGreaterThan(0)
      expect(above).toBeLessThan(below)
    })
  })

  describe("over a small window", () => {
    it("shrinks to stay inside the window, even at the large size", () => {
      const caller = { left: 0, top: 0, width: 600, height: 400 }

      const bounds = spotlightBoundsOver(caller, "Large")

      expect(bounds.left).toBeGreaterThanOrEqual(caller.left)
      expect(bounds.top).toBeGreaterThanOrEqual(caller.top)
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(caller.left + caller.width)
      expect(bounds.top + bounds.height).toBeLessThanOrEqual(caller.top + caller.height)
    })

    it("doesn't shrink below a usable size", () => {
      const bounds = spotlightBoundsOver({ left: 0, top: 0, width: 200, height: 150 }, "Large")

      expect([bounds.width, bounds.height]).toStrictEqual([360, 240])
    })
  })

  it("has whole-number position and size", () => {
    const bounds = spotlightBoundsOver({ left: 0, top: 0, width: 1001, height: 777 }, "Normal")

    expect(Object.values(bounds).every(Number.isInteger)).toBe(true)
  })
})
