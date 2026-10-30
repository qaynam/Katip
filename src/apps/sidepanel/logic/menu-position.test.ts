import { describe, expect, it } from "vitest"
import { fitMenuPosition, pointRect } from "./menu-position"

const viewport = { width: 360, height: 600 }
const menu = { width: 200, height: 160 }

describe("右クリックした位置にメニューを開くとき", () => {
  it("画面に収まるなら、クリック位置を左上としてそのまま開く", () => {
    expect(fitMenuPosition(pointRect({ x: 40, y: 100 }), menu, viewport)).toStrictEqual({
      x: 40,
      y: 100,
    })
  })

  it("右にはみ出すなら、クリック位置の左側へ開く", () => {
    expect(fitMenuPosition(pointRect({ x: 300, y: 100 }), menu, viewport)).toStrictEqual({
      x: 100,
      y: 100,
    })
  })

  it("下にはみ出すなら、クリック位置の上側へ開く", () => {
    expect(fitMenuPosition(pointRect({ x: 40, y: 550 }), menu, viewport)).toStrictEqual({
      x: 40,
      y: 390,
    })
  })

  it("左右どちらにも収まらないなら、右端の余白に揃える", () => {
    const wide = { width: 300, height: 160 }

    expect(fitMenuPosition(pointRect({ x: 200, y: 100 }), wide, viewport).x).toBe(52)
  })

  it("メニューが画面より大きいなら、左上の余白に揃える", () => {
    const huge = { width: 400, height: 700 }

    expect(fitMenuPosition(pointRect({ x: 200, y: 300 }), huge, viewport)).toStrictEqual({
      x: 8,
      y: 8,
    })
  })
})

describe("ボタンの下にメニューを開くとき", () => {
  const button = { left: 320, top: 40, right: 344, bottom: 64 }

  it("右にはみ出すなら、メニューの右端をボタンの右端に揃える", () => {
    expect(fitMenuPosition(button, menu, viewport)).toStrictEqual({ x: 144, y: 64 })
  })

  it("下にはみ出すなら、ボタンの上側へ開く", () => {
    const lowButton = { left: 20, top: 500, right: 44, bottom: 524 }

    expect(fitMenuPosition(lowButton, menu, viewport)).toStrictEqual({ x: 20, y: 340 })
  })
})
