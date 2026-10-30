import { fitMenuPosition, type Point, type Rect } from "../logic/menu-position"

/**
 * 画面上の anchor に合わせて、node を offsetParent の中に収まる位置へ置くときの座標。
 * 返す座標は offsetParent の左上からの位置。
 */
export const popoverPosition = (node: HTMLElement, anchor: Rect): Point => {
  const container = node.offsetParent?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
  return fitMenuPosition(
    {
      left: anchor.left - container.left,
      right: anchor.right - container.left,
      top: anchor.top - container.top,
      bottom: anchor.bottom - container.top,
    },
    { width: node.offsetWidth, height: node.offsetHeight },
    { width: container.width, height: container.height },
  )
}
