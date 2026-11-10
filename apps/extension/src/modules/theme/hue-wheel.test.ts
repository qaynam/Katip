import { describe, expect, it } from "vitest"
import { swatchOf } from "./appearance"
import { hueWheelBackground } from "./hue-wheel"
import { colorAtPoint } from "./picker"

describe("hueWheelBackground", () => {
  it("tints each direction, clockwise from the right, with the most vivid color of the hue picked there", () => {
    const background = hueWheelBackground()
    const stopAt = (angle: number, point: { x: number; y: number }) =>
      `${swatchOf({ hue: colorAtPoint(point).hue, chroma: 1 })} ${angle}deg`

    expect(background).toContain("from 90deg")
    expect(
      [stopAt(0, { x: 1, y: 0 }), stopAt(90, { x: 0, y: -1 }), stopAt(180, { x: -1, y: 0 })].every(
        (stop) => background.includes(stop),
      ),
    ).toBe(true)
  })

  it("pales the tint toward the palest color at the sides", () => {
    expect(hueWheelBackground()).toContain(
      `radial-gradient(closest-side, transparent, ${swatchOf({ hue: 0, chroma: 0 })})`,
    )
  })
})
