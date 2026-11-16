import { Array, Option, Order } from "effect"
import type { SpaceId, SpaceList } from "#modules/space"
import { groupColorOf } from "#modules/theme"
import { activeSpaceOf, spaceOf, type Workspace } from "#modules/workspace"
import type { BrowserTab, TabId } from "#platform/browser"
import type { DesiredGroup } from "./tab-group-sync-plan"

const byIndex = Order.mapInput(Order.Number, (tab: Pick<BrowserTab, "index">) => tab.index)

/**
 * Builds the tab groups every window should have, from which Space each tab belongs to.
 *
 * Leaves out a Space and window pair with no tab. Within a window, groups follow the order of the
 * Space list, and tabs are in index order.
 *
 * @param favoriteTabSpaces - The Space of each tab open for a Favorite. The ones unpinned while
 *   their Space isn't shown join its group, as its other tabs do.
 */
export const desiredGroupsFor = (
  spaces: SpaceList,
  workspace: Workspace,
  tabs: ReadonlyArray<Pick<BrowserTab, "id" | "windowId" | "index" | "pinned">>,
  favoriteTabSpaces: ReadonlyMap<TabId, SpaceId> = new Map(),
): ReadonlyArray<DesiredGroup> => {
  const members = Array.sort(tabs, byIndex).filter((tab) => !tab.pinned)
  const windowIds = Array.dedupe(members.map((tab) => tab.windowId))
  const spaceOfTab = (tabId: TabId) =>
    Option.orElse(spaceOf(workspace, tabId), () =>
      Option.fromUndefinedOr(favoriteTabSpaces.get(tabId)),
    )
  return windowIds.flatMap((windowId) => {
    const activeSpaceId = activeSpaceOf(workspace, windowId)
    return spaces.flatMap((space) => {
      const tabIds = members
        .filter((tab) => tab.windowId === windowId && Option.contains(spaceOfTab(tab.id), space.id))
        .map((tab) => tab.id)
      return tabIds.length === 0
        ? []
        : [
            {
              windowId,
              spaceId: space.id,
              title: space.name,
              color: groupColorOf(space.theme),
              collapsed: Option.exists(activeSpaceId, (active) => active !== space.id),
              tabIds,
            },
          ]
    })
  })
}
