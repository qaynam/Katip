import { Array, Match, Option, pipe } from "effect"
import type { TabId } from "#platform/browser"

export type DisplayPlacement =
  | { readonly _tag: "Above"; readonly tabId: TabId }
  | { readonly _tag: "Below"; readonly tabId: TabId }
  | { readonly _tag: "Top" }
  | { readonly _tag: "Bottom" }

/** Reorders a Space's tabs from Chrome's tab index order into the order the side panel shows. */
export const displayOrder = <A>(
  tabsInIndexOrder: ReadonlyArray<A>,
  options: { readonly newestOnTop: boolean },
): ReadonlyArray<A> => (options.newestOnTop ? Array.reverse(tabsInIndexOrder) : tabsInIndexOrder)

type IndexAnchor = { readonly side: "before" | "after"; readonly tabId: TabId }

const flip = (side: IndexAnchor["side"]) => (side === "before" ? "after" : "before")

const toIndexAnchor = (
  placement: DisplayPlacement,
  others: ReadonlyArray<TabId>,
  newestOnTop: boolean,
): Option.Option<IndexAnchor> => {
  const orient = (anchor: IndexAnchor): IndexAnchor =>
    newestOnTop ? { ...anchor, side: flip(anchor.side) } : anchor
  return Match.value(placement).pipe(
    Match.tagsExhaustive({
      Above: ({ tabId }) => Option.some(orient({ side: "before", tabId })),
      Below: ({ tabId }) => Option.some(orient({ side: "after", tabId })),
      // The top of the display is the lowest-index tab, or the highest when the order is flipped
      Top: () =>
        Option.map(newestOnTop ? Array.last(others) : Array.head(others), (tabId) => ({
          side: newestOnTop ? ("after" as const) : ("before" as const),
          tabId,
        })),
      Bottom: () =>
        Option.map(newestOnTop ? Array.head(others) : Array.last(others), (tabId) => ({
          side: newestOnTop ? ("before" as const) : ("after" as const),
          tabId,
        })),
    }),
  )
}

// Landing between the two tabs of a split view would break the split up. When the anchor is one
// half of a split, anchor on its left tab when placing before and its right tab when placing after,
// so the tab lands outside the pair
const outerEdgeOf = (
  anchor: IndexAnchor,
  windowTabs: ReadonlyArray<TabId>,
  unitOf: (tabId: TabId) => ReadonlyArray<TabId>,
): IndexAnchor => {
  const unit = windowTabs.filter((tab) => unitOf(anchor.tabId).includes(tab))
  const edge = anchor.side === "before" ? Array.head(unit) : Array.last(unit)
  return { ...anchor, tabId: Option.getOrElse(edge, () => anchor.tabId) }
}

/**
 * Converts a placement given in display order into the index to pass to `chrome.tabs.move`.
 *
 * @param windowTabs - Every tab in the window in index order, including Chrome-pinned tabs and tabs
 *   of other Spaces.
 * @param spaceTabs - The temporary tabs of the destination Space in index order.
 * @param moving - The tabs to move. For a split view, both tabs in index order.
 * @param unitOf - The tabs that move together with the given tab (those of the same split view).
 *   Defaults to just that tab.
 * @returns The index the first moved tab occupies after the move, or none when nothing needs to
 *   move, such as when the anchor tab isn't there.
 */
export const moveIndexFor = (params: {
  readonly windowTabs: ReadonlyArray<TabId>
  readonly spaceTabs: ReadonlyArray<TabId>
  readonly moving: ReadonlyArray<TabId>
  readonly placement: DisplayPlacement
  readonly newestOnTop: boolean
  readonly unitOf?: (tabId: TabId) => ReadonlyArray<TabId>
}): Option.Option<number> => {
  const unitOf = params.unitOf ?? ((tabId: TabId) => [tabId])
  const withoutMoving = (tabs: ReadonlyArray<TabId>) =>
    tabs.filter((tab) => !params.moving.includes(tab))
  const remaining = withoutMoving(params.windowTabs)
  return pipe(
    toIndexAnchor(params.placement, withoutMoving(params.spaceTabs), params.newestOnTop),
    Option.map((anchor) => outerEdgeOf(anchor, remaining, unitOf)),
    Option.flatMap((anchor) =>
      Option.map(
        Array.findFirstIndex(remaining, (tab) => tab === anchor.tabId),
        (position) => (anchor.side === "before" ? position : position + 1),
      ),
    ),
  )
}
