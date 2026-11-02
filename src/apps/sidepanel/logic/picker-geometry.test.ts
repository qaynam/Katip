import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  dialValueAt,
  FIELD_EDGE_INSET_PX,
  pickerPointAt,
  pointAfterKey,
  sliderValueAt,
  valueAfterKey,
} from "./picker-geometry"

const field = { width: 300, height: 248 }
const radius = field.height / 2 - FIELD_EDGE_INSET_PX

describe("Positions in the color field", () => {
  it("maps the field's center to the circle's center", () => {
    expect(pickerPointAt({ x: 150, y: 124 }, field)).toStrictEqual({ x: 0, y: 0 })
  })

  it("uses half the shorter side minus the edge inset as the circle's radius", () => {
    expect(pickerPointAt({ x: 150 + radius, y: 124 }, field)).toStrictEqual({ x: 1, y: 0 })
  })

  it("maps up on screen to up on the circle", () => {
    expect(pickerPointAt({ x: 150, y: 124 - radius / 2 }, field)).toStrictEqual({ x: 0, y: 0.5 })
  })

  it("gives finite positions even for a field with no size", () => {
    const point = pickerPointAt({ x: 10, y: 10 }, { width: 0, height: 0 })

    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
  })
})

describe("Intensity slider", () => {
  const track = { length: 216, thumbLength: 16 }

  it("is 0 with the thumb centered at the left end and 1 at the right end", () => {
    expect([sliderValueAt(8, track), sliderValueAt(208, track)]).toStrictEqual([0, 1])
  })

  it("is 0.5 in the middle", () => {
    expect(sliderValueAt(108, track)).toBe(0.5)
  })

  it("stays within 0 to 1 when pointing outside the track", () => {
    expect([sliderValueAt(-40, track), sliderValueAt(400, track)]).toStrictEqual([0, 1])
  })
})

describe("Grain dial", () => {
  it("is 0 straight up and grows clockwise", () => {
    const values = [
      dialValueAt({ x: 0, y: -10 }, 0),
      dialValueAt({ x: 10, y: 0 }, 0.2),
      dialValueAt({ x: 0, y: 10 }, 0.4),
      dialValueAt({ x: -10, y: 0 }, 0.7),
    ]

    expect(values).toStrictEqual([0, 0.25, 0.5, 0.75])
  })

  it("stops at the maximum instead of wrapping to 0 when turned past the top from near the maximum", () => {
    expect(dialValueAt({ x: 1, y: -10 }, 0.97)).toBe(1)
  })

  it("stops at 0 instead of jumping to the maximum when turned counterclockwise past the top from the minimum", () => {
    expect(dialValueAt({ x: -1, y: -10 }, 0.03)).toBe(0)
  })
})

describe("Keyboard adjustment", () => {
  it("increases a little with the right and up arrows and decreases with the left and down arrows", () => {
    const after = (key: string) => Option.getOrNull(valueAfterKey(0.5, key))

    expect([after("ArrowRight"), after("ArrowUp"), after("ArrowLeft"), after("ArrowDown")]).toEqual(
      [0.55, 0.55, 0.45, 0.45],
    )
  })

  it("moves to the ends with Home and End and never goes beyond 0 to 1", () => {
    const values = [
      valueAfterKey(0.5, "Home"),
      valueAfterKey(0.5, "End"),
      valueAfterKey(0.98, "ArrowRight"),
    ].map(Option.getOrNull)

    expect(values).toStrictEqual([0, 1, 1])
  })

  it("ignores keys that don't adjust the value", () => {
    expect(Option.isNone(valueAfterKey(0.5, "Enter"))).toBe(true)
  })

  it("moves the color dot in the arrow key's direction on screen", () => {
    const after = (key: string) => Option.getOrNull(pointAfterKey({ x: 0, y: 0 }, key))

    expect([after("ArrowUp"), after("ArrowRight")]).toStrictEqual([
      { x: 0, y: 0.05 },
      { x: 0.05, y: 0 },
    ])
  })
})
