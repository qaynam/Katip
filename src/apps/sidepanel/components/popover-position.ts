import { fitMenuPosition, type Point, type Rect } from "../logic/menu-position"

/**
 * Where to place node so that it lines up with the on-screen anchor while staying inside its
 * offsetParent. The returned point is relative to the offsetParent's top-left corner.
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
