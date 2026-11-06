import { Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  dialValueAt,
  FIELD_EDGE_INSET_PX,
  fieldOffsetOf,
  pickerPointAt,
  pointAfterKey,
  sliderValueAt,
  valueAfterKey,
} from "./picker-geometry"

const field = { width: 300, height: 248 }
const reach = {
  x: field.width / 2 - FIELD_EDGE_INSET_PX,
  y: field.height / 2 - FIELD_EDGE_INSET_PX,
}
const distanceOf = ({ x, y }: { x: number; y: number }) => Math.hypot(x, y)

describe("Positions in the color field", () => {
  it("maps the field's center to the circle's center", () => {
    expect(pickerPointAt({ x: 150, y: 124 }, field)).toStrictEqual({ x: 0, y: 0 })
  })

  it("reaches the circle's edge just inside each side of the field", () => {
    const points = [
      pickerPointAt({ x: 150 + reach.x, y: 124 }, field),
      pickerPointAt({ x: 150, y: 124 - reach.y }, field),
    ]

    expect(points).toStrictEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
  })

  it("reaches the circle's edge in the field's corners too", () => {
    const corner = pickerPointAt({ x: FIELD_EDGE_INSET_PX, y: FIELD_EDGE_INSET_PX }, field)

    expect(distanceOf(corner)).toBeCloseTo(1)
  })

  it("keeps the direction from the center, so up on screen is up on the circle", () => {
    const point = pickerPointAt({ x: 150 + 30, y: 124 - 40 }, field)

    expect(Math.atan2(point.y, point.x)).toBeCloseTo(Math.atan2(40, 30))
  })

  it("places each point's dot where pressing would pick it", () => {
    const offsets = [
      { x: 150, y: 124 },
      { x: 150 + reach.x, y: 124 },
      { x: 60, y: 200 },
      { x: FIELD_EDGE_INSET_PX, y: field.height - FIELD_EDGE_INSET_PX },
    ]

    const roundTrips = offsets.map((offset) => fieldOffsetOf(pickerPointAt(offset, field), field))

    roundTrips.forEach((roundTrip, index) => {
      expect(roundTrip.x).toBeCloseTo(offsets[index]?.x ?? Number.NaN)
      expect(roundTrip.y).toBeCloseTo(offsets[index]?.y ?? Number.NaN)
    })
  })

  it("gives finite positions even for a field with no size", () => {
    const point = pickerPointAt({ x: 10, y: 10 }, { width: 0, height: 0 })
    const offset = fieldOffsetOf({ x: 0.5, y: 0.5 }, { width: 0, height: 0 })

    expect([point.x, point.y, offset.x, offset.y].every(Number.isFinite)).toBe(true)
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
