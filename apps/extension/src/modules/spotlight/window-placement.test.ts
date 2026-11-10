import { describe, expect, it } from "vitest"
import { DEFAULT_SPOTLIGHT_POSITION } from "./spotlight-size"
import { spotlightBoundsOver } from "./window-placement"

const centered = DEFAULT_SPOTLIGHT_POSITION

describe("Spotlight window placement", () => {
  describe("over a large enough window", () => {
    const caller = { left: 100, top: 50, width: 1440, height: 900 }

    it("opens 640px wide and 440px high at the normal size", () => {
      const { width, height } = spotlightBoundsOver(caller, "Normal", centered)

      expect([width, height]).toStrictEqual([640, 440])
    })

    it("opens as wide at the compact size, and wider at the large size", () => {
      const sizes = (["Compact", "Large"] as const).map((size) => {
        const { width, height } = spotlightBoundsOver(caller, size, centered)
        return [width, height]
      })

      expect(sizes).toStrictEqual([
        [640, 440],
        [860, 500],
      ])
    })

    it("is centered horizontally by default", () => {
      const { left, width } = spotlightBoundsOver(caller, "Normal", centered)

      expect(left - caller.left).toBe(caller.left + caller.width - (left + width))
    })

    it("sits above vertical center by default, clear of the top edge", () => {
      const { top, height } = spotlightBoundsOver(caller, "Normal", centered)
      const above = top - caller.top
      const below = caller.top + caller.height - (top + height)

      expect(above).toBeGreaterThan(0)
      expect(above).toBeLessThan(below)
    })

    it("shares out the room around it as the position says", () => {
      const { left, top } = spotlightBoundsOver(caller, "Normal", { x: 0.25, y: 1 })

      // 800px of room across and 460px down
      expect([left, top]).toStrictEqual([100 + 200, 50 + 460])
    })

    it("can sit against the left and top edges", () => {
      const { left, top } = spotlightBoundsOver(caller, "Normal", { x: 0, y: 0 })

      expect([left, top]).toStrictEqual([caller.left, caller.top])
    })
  })

  describe("over a small window", () => {
    it("shrinks to stay inside the window, even at the large size", () => {
      const caller = { left: 0, top: 0, width: 600, height: 400 }

      const bounds = spotlightBoundsOver(caller, "Large", centered)

      expect(bounds.left).toBeGreaterThanOrEqual(caller.left)
      expect(bounds.top).toBeGreaterThanOrEqual(caller.top)
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(caller.left + caller.width)
      expect(bounds.top + bounds.height).toBeLessThanOrEqual(caller.top + caller.height)
    })

    it("doesn't shrink below a usable size", () => {
      const bounds = spotlightBoundsOver(
        { left: 0, top: 0, width: 200, height: 150 },
        "Large",
        centered,
      )

      expect([bounds.width, bounds.height]).toStrictEqual([360, 240])
    })
  })

  it("has whole-number position and size", () => {
    const bounds = spotlightBoundsOver({ left: 0, top: 0, width: 1001, height: 777 }, "Normal", {
      x: 0.333,
      y: 0.777,
    })

    expect(Object.values(bounds).every(Number.isInteger)).toBe(true)
  })
})
