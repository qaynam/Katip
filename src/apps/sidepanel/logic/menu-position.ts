export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export const pointRect = (point: Point): Rect => ({
  left: point.x,
  top: point.y,
  right: point.x,
  bottom: point.y,
})

const placeOnAxis = (
  preferredStart: number,
  flippedEnd: number,
  length: number,
  viewportLength: number,
  margin: number,
): number => {
  const fitsPreferred = preferredStart + length <= viewportLength - margin
  if (fitsPreferred) return preferredStart
  const flippedStart = flippedEnd - length
  if (flippedStart >= margin) return flippedStart
  return Math.max(margin, viewportLength - length - margin)
}

/**
 * アンカーの右下に開くのを基本とし、はみ出す軸だけアンカーの反対側へ反転する。
 * どちらにも収まらなければ画面の端に寄せる（メニューが画面より大きい場合は左上の余白に揃える）。
 */
export const fitMenuPosition = (anchor: Rect, menu: Size, viewport: Size, margin = 8): Point => ({
  x: placeOnAxis(anchor.left, anchor.right, menu.width, viewport.width, margin),
  y: placeOnAxis(anchor.bottom, anchor.top, menu.height, viewport.height, margin),
})
