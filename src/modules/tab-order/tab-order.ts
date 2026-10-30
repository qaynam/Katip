import { Array, Match, Option, pipe } from "effect"
import type { TabId } from "#platform/browser"

export type DisplayPlacement =
  | { readonly _tag: "Above"; readonly tabId: TabId }
  | { readonly _tag: "Below"; readonly tabId: TabId }
  | { readonly _tag: "Top" }
  | { readonly _tag: "Bottom" }

/**
 * Chrome のタブ index 順に並んだ Space のタブを、サイドパネルの表示順に並べ替える。
 */
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
      // 表示の先頭は、上下反転していなければ index の最小、反転していれば最大のタブ
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

/**
 * 表示順で指定された置き場所を、`chrome.tabs.move` に渡す index に換算する。
 *
 * @param windowTabs - ウィンドウの全タブを index 順に並べたもの（固定タブや他 Space のタブも含む）。
 * @param spaceTabs - 移動先 Space の一時タブを index 順に並べたもの。
 * @returns 移動後にそのタブが占める index。基準のタブが無いなど、動かす必要が無いときは none。
 */
export const moveIndexFor = (params: {
  readonly windowTabs: ReadonlyArray<TabId>
  readonly spaceTabs: ReadonlyArray<TabId>
  readonly moving: TabId
  readonly placement: DisplayPlacement
  readonly newestOnTop: boolean
}): Option.Option<number> => {
  const withoutMoving = (tabs: ReadonlyArray<TabId>) => tabs.filter((tab) => tab !== params.moving)
  const remaining = withoutMoving(params.windowTabs)
  return pipe(
    toIndexAnchor(params.placement, withoutMoving(params.spaceTabs), params.newestOnTop),
    Option.flatMap((anchor) =>
      Option.map(
        Array.findFirstIndex(remaining, (tab) => tab === anchor.tabId),
        (position) => (anchor.side === "before" ? position : position + 1),
      ),
    ),
  )
}
