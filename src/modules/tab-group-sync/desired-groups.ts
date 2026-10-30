import { Array, Option, Order } from "effect"
import type { SpaceList } from "#modules/space"
import { activeSpaceOf, spaceOf, type Workspace } from "#modules/workspace"
import type { BrowserTab } from "#platform/browser"
import type { DesiredGroup } from "./tab-group-sync-plan"

const byIndex = Order.mapInput(Order.Number, (tab: Pick<BrowserTab, "index">) => tab.index)

/**
 * Space の所属から、全ウィンドウ分のあるべきタブグループを組み立てる。
 *
 * タブを 1 つも持たない Space・ウィンドウの組は含めない。並びは Space 一覧の順、
 * タブは index 順。
 */
export const desiredGroupsFor = (
  spaces: SpaceList,
  workspace: Workspace,
  tabs: ReadonlyArray<Pick<BrowserTab, "id" | "windowId" | "index" | "pinned">>,
): ReadonlyArray<DesiredGroup> => {
  const members = Array.sort(tabs, byIndex).filter((tab) => !tab.pinned)
  const windowIds = Array.dedupe(members.map((tab) => tab.windowId))
  return windowIds.flatMap((windowId) => {
    const activeSpaceId = activeSpaceOf(workspace, windowId)
    return spaces.flatMap((space) => {
      const tabIds = members
        .filter(
          (tab) =>
            tab.windowId === windowId && Option.contains(spaceOf(workspace, tab.id), space.id),
        )
        .map((tab) => tab.id)
      return tabIds.length === 0
        ? []
        : [
            {
              windowId,
              spaceId: space.id,
              title: space.name,
              color: space.color,
              collapsed: Option.exists(activeSpaceId, (active) => active !== space.id),
              tabIds,
            },
          ]
    })
  })
}
