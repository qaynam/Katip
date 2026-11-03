import { Array, Effect, Option, Order } from "effect"
import { SettingsRepository } from "#modules/settings"
import type { SpaceId } from "#modules/space"
import { moveIndexFor, type DisplayPlacement } from "#modules/tab-order"
import { trackedTab } from "#modules/workspace"
import { type BrowserTab, type TabId, Tabs } from "#platform/browser"
import { KatipState } from "./katip-state"

export const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const splitPartnersIn = (windowTabs: ReadonlyArray<BrowserTab>) => (tabId: TabId) => {
  const splitViewId = windowTabs.find((tab) => tab.id === tabId)?.splitViewId ?? Option.none()
  return Option.match(splitViewId, {
    onNone: () => [tabId],
    onSome: (id) =>
      windowTabs.filter((tab) => Option.contains(tab.splitViewId, id)).map((tab) => tab.id),
  })
}

// Whether a split view survives moving both of its tabs together depends on the Chrome version.
// If it came apart, the tabs are still side by side, so the split is made again
const resplitIfBroken = Effect.fnUntraced(function* (moved: ReadonlyArray<BrowserTab>) {
  const [left, right] = moved
  if (left === undefined || right === undefined || Option.isNone(left.splitViewId)) return
  const tabs = yield* Tabs
  const current = yield* tabs.get(left.id)
  if (Option.isSome(current.splitViewId)) return
  yield* tabs.createSplit([left.id, right.id])
})

/**
 * Moves temporary tabs of the Space to the given position in display order.
 *
 * @param moving - The tabs in index order: one, or both tabs of a split view.
 */
export const moveAmongTemporary = Effect.fnUntraced(function* (
  moving: ReadonlyArray<BrowserTab>,
  spaceId: SpaceId,
  placement: DisplayPlacement,
) {
  const [first] = moving
  if (first === undefined) return
  const tabs = yield* Tabs
  const settings = yield* (yield* SettingsRepository).get
  const workspace = yield* (yield* KatipState).workspace.get
  const windowTabs = Array.sort(yield* tabs.query({ windowId: first.windowId }), byIndex)
  const spaceTabs = windowTabs
    .filter((candidate) =>
      Option.exists(
        trackedTab(workspace, candidate.id),
        (tracked) => tracked.spaceId === spaceId && tracked.pinned === null,
      ),
    )
    .map((candidate) => candidate.id)
  const index = moveIndexFor({
    windowTabs: windowTabs.map((candidate) => candidate.id),
    spaceTabs,
    moving: moving.map((tab) => tab.id),
    placement,
    newestOnTop: settings.newTabsOnTop,
    unitOf: splitPartnersIn(windowTabs),
  })
  if (Option.isNone(index)) return
  yield* tabs.move(
    moving.map((tab) => tab.id),
    { index: index.value },
  )
  yield* resplitIfBroken(moving)
})
