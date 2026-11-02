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
 * Opens below and to the right of the anchor, flipping to the anchor's other side only on the
 * axis that would overflow. If neither side fits, it snaps to the viewport edge (to the top-left
 * margin when the menu is larger than the viewport).
 */
export const fitMenuPosition = (anchor: Rect, menu: Size, viewport: Size, margin = 8): Point => ({
  x: placeOnAxis(anchor.left, anchor.right, menu.width, viewport.width, margin),
  y: placeOnAxis(anchor.bottom, anchor.top, menu.height, viewport.height, margin),
})
