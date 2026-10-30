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

describe("色フィールドの位置", () => {
  it("フィールドの中央は円の中心になる", () => {
    expect(pickerPointAt({ x: 150, y: 124 }, field)).toStrictEqual({ x: 0, y: 0 })
  })

  it("短い辺の半分から縁の余白を除いた距離が円の半径になる", () => {
    expect(pickerPointAt({ x: 150 + radius, y: 124 }, field)).toStrictEqual({ x: 1, y: 0 })
  })

  it("画面の上方向が円の上方向になる", () => {
    expect(pickerPointAt({ x: 150, y: 124 - radius / 2 }, field)).toStrictEqual({ x: 0, y: 0.5 })
  })

  it("大きさの無いフィールドでも位置が有限の値になる", () => {
    const point = pickerPointAt({ x: 10, y: 10 }, { width: 0, height: 0 })

    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
  })
})

describe("強さのスライダー", () => {
  const track = { length: 216, thumbLength: 16 }

  it("つまみの中心が左端にあるとき 0、右端にあるとき 1 になる", () => {
    expect([sliderValueAt(8, track), sliderValueAt(208, track)]).toStrictEqual([0, 1])
  })

  it("中央では 0.5 になる", () => {
    expect(sliderValueAt(108, track)).toBe(0.5)
  })

  it("トラックの外を指しても 0〜1 に収まる", () => {
    expect([sliderValueAt(-40, track), sliderValueAt(400, track)]).toStrictEqual([0, 1])
  })
})

describe("グレインのダイヤル", () => {
  it("真上が 0 で、時計回りに回すほど大きくなる", () => {
    const values = [
      dialValueAt({ x: 0, y: -10 }, 0),
      dialValueAt({ x: 10, y: 0 }, 0.2),
      dialValueAt({ x: 0, y: 10 }, 0.4),
      dialValueAt({ x: -10, y: 0 }, 0.7),
    ]

    expect(values).toStrictEqual([0, 0.25, 0.5, 0.75])
  })

  it("最大の手前から真上を越えて回しても、0 に戻らず最大で止まる", () => {
    expect(dialValueAt({ x: 1, y: -10 }, 0.97)).toBe(1)
  })

  it("最小から反時計回りに真上を越えて回しても、最大へ飛ばず 0 で止まる", () => {
    expect(dialValueAt({ x: -1, y: -10 }, 0.03)).toBe(0)
  })
})

describe("キーボードでの調整", () => {
  it("右と上の矢印で少し増え、左と下の矢印で少し減る", () => {
    const after = (key: string) => Option.getOrNull(valueAfterKey(0.5, key))

    expect([after("ArrowRight"), after("ArrowUp"), after("ArrowLeft"), after("ArrowDown")]).toEqual(
      [0.55, 0.55, 0.45, 0.45],
    )
  })

  it("Home と End で端まで動き、0〜1 を越えない", () => {
    const values = [
      valueAfterKey(0.5, "Home"),
      valueAfterKey(0.5, "End"),
      valueAfterKey(0.98, "ArrowRight"),
    ].map(Option.getOrNull)

    expect(values).toStrictEqual([0, 1, 1])
  })

  it("調整に使わないキーは扱わない", () => {
    expect(Option.isNone(valueAfterKey(0.5, "Enter"))).toBe(true)
  })

  it("矢印キーで色の点を画面上のその向きへ動かす", () => {
    const after = (key: string) => Option.getOrNull(pointAfterKey({ x: 0, y: 0 }, key))

    expect([after("ArrowUp"), after("ArrowRight")]).toStrictEqual([
      { x: 0, y: 0.05 },
      { x: 0.05, y: 0 },
    ])
  })
})
