import { Option } from "effect"
import type { WindowBounds } from "#platform/browser"

export type PageSide = "Left" | "Right"

/** Where a tab was let go outside the side panel, in screen coordinates. */
export interface PageDrop {
  readonly x: number
  readonly y: number
  readonly panelLeft: number
  readonly panelRight: number
}

/**
 * The side of the shown tab that a tab let go over the page splits to: the left or right third of
 * the page, which is the part of the window beside the side panel.
 *
 * @returns None in the middle third, which is left alone so that letting go there by mistake
 *   changes nothing, and outside the page.
 */
export const pageSideOfDrop = (drop: PageDrop, window: WindowBounds): Option.Option<PageSide> => {
  const windowRight = window.left + window.width
  const isPanelOnTheRight = drop.panelLeft + drop.panelRight > window.left + windowRight
  const pageLeft = isPanelOnTheRight ? window.left : drop.panelRight
  const pageRight = isPanelOnTheRight ? drop.panelLeft : windowRight
  const isOnPage =
    drop.x >= pageLeft &&
    drop.x <= pageRight &&
    drop.y >= window.top &&
    drop.y <= window.top + window.height
  if (!isOnPage) return Option.none()
  const third = (pageRight - pageLeft) / 3
  if (drop.x <= pageLeft + third) return Option.some("Left")
  if (drop.x >= pageRight - third) return Option.some("Right")
  return Option.none()
}
