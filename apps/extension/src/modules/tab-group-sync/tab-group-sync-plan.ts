import { Array, Option, Schema } from "effect"
import { SpaceId } from "#modules/space"
import {
  type BrowserTab,
  type BrowserTabGroup,
  TabGroupColor,
  TabGroupId,
  TabId,
  WindowId,
} from "#platform/browser"
import type { ProjectedGroup, TabGroupProjection } from "./tab-group-projection"

export const GroupAppearance = Schema.Struct({
  title: Schema.String,
  color: TabGroupColor,
  collapsed: Schema.Boolean,
})
export type GroupAppearance = typeof GroupAppearance.Type

export const DesiredGroup = Schema.Struct({
  ...GroupAppearance.fields,
  windowId: WindowId,
  spaceId: SpaceId,
  tabIds: Schema.Array(TabId),
})
export type DesiredGroup = typeof DesiredGroup.Type

export type ObservedTab = Pick<BrowserTab, "id" | "windowId" | "groupId" | "pinned">

export type ObservedTabGroup = Pick<
  BrowserTabGroup,
  "id" | "windowId" | "title" | "color" | "collapsed"
>

export const TabGroupOperation = Schema.TaggedUnion({
  CreateGroup: {
    spaceId: SpaceId,
    windowId: WindowId,
    tabIds: Schema.NonEmptyArray(TabId),
    appearance: GroupAppearance,
  },
  AddTabsToGroup: { groupId: TabGroupId, tabIds: Schema.NonEmptyArray(TabId) },
  UpdateGroup: { groupId: TabGroupId, appearance: GroupAppearance },
  UngroupTabs: { tabIds: Schema.NonEmptyArray(TabId) },
})
export type TabGroupOperation = typeof TabGroupOperation.Type

export interface TabGroupSyncPlan {
  /**
   * Meant to run in order from the first (operations adding tabs to groups come before those
   * removing them). Includes no reordering.
   */
  readonly operations: ReadonlyArray<TabGroupOperation>
  /** Leaves out the groups to be created, whose ids aren't known until the operations run. */
  readonly reusedGroups: TabGroupProjection
}

type SpaceInWindow = Pick<ProjectedGroup, "spaceId" | "windowId">

const isSameSpaceInWindow = (a: SpaceInWindow, b: SpaceInWindow) =>
  a.spaceId === b.spaceId && a.windowId === b.windowId

type GroupTarget = Omit<DesiredGroup, "tabIds"> & {
  readonly tabIds: Array.NonEmptyReadonlyArray<TabId>
}

const appearanceOf = ({ title, color, collapsed }: GroupAppearance): GroupAppearance => ({
  title,
  color,
  collapsed,
})

const looksAsDesired = (group: ObservedTabGroup, desired: GroupAppearance) =>
  Option.getOrElse(group.title, () => "") === desired.title &&
  group.color === desired.color &&
  group.collapsed === desired.collapsed

// tabs.group would move a tab from another window into the group's window, and unpin a pinned tab
const canJoinGroupIn = (windowId: WindowId, tab: ObservedTab | undefined) =>
  tab !== undefined && tab.windowId === windowId && !tab.pinned

const assignTabsToTargets = (
  desired: ReadonlyArray<DesiredGroup>,
  tabsById: ReadonlyMap<TabId, ObservedTab>,
): ReadonlyArray<GroupTarget> => {
  const [, targets] = Array.mapAccum(
    Array.dedupeWith(desired, isSameSpaceInWindow),
    new Set<TabId>() as ReadonlySet<TabId>,
    (assigned, group) => {
      const tabIds = Array.dedupe(group.tabIds).filter(
        (tabId) => !assigned.has(tabId) && canJoinGroupIn(group.windowId, tabsById.get(tabId)),
      )
      const target: Option.Option<GroupTarget> = Array.isReadonlyArrayNonEmpty(tabIds)
        ? Option.some({ ...group, tabIds })
        : Option.none()
      return [new Set([...assigned, ...tabIds]), target] as const
    },
  )
  return Array.getSomes(targets)
}

const isInGroup = (tab: ObservedTab | undefined, groupId: TabGroupId) =>
  tab !== undefined && Option.contains(tab.groupId, groupId)

const createGroupFor = (target: GroupTarget): TabGroupOperation => ({
  _tag: "CreateGroup",
  spaceId: target.spaceId,
  windowId: target.windowId,
  tabIds: target.tabIds,
  appearance: appearanceOf(target),
})

const alignGroupWith = (
  target: GroupTarget,
  group: ObservedTabGroup,
  tabsById: ReadonlyMap<TabId, ObservedTab>,
): ReadonlyArray<TabGroupOperation> => {
  const outsiders = target.tabIds.filter((tabId) => !isInGroup(tabsById.get(tabId), group.id))
  const addition: ReadonlyArray<TabGroupOperation> = Array.isReadonlyArrayNonEmpty(outsiders)
    ? [{ _tag: "AddTabsToGroup", groupId: group.id, tabIds: outsiders }]
    : []
  const restyle: ReadonlyArray<TabGroupOperation> = looksAsDesired(group, target)
    ? []
    : [{ _tag: "UpdateGroup", groupId: group.id, appearance: appearanceOf(target) }]
  return [...addition, ...restyle]
}

/**
 * Plans the operations that bring Chrome's tab groups in line with `desired`.
 *
 * @param desired - What every window should look like. What's remembered for a Space and window
 *   not in it is discarded, and the tabs left in its group are ungrouped.
 * @param projection - The group each Space and window used in the previous sync.
 *
 * @remarks
 * - A group not in the projection (one the user made) keeps its appearance, and tabs outside any
 *   Space aren't removed from it. Tabs of a Space found there move to the Space's group.
 * - A tab not in the given window, and a tab pinned in Chrome, never join a group.
 * - When the same tab, or the same Space and window, is given more than once, the first wins.
 * - Planning again from the result of carrying out the plan yields no operations.
 */
export const planTabGroupSync = (
  desired: ReadonlyArray<DesiredGroup>,
  actualTabs: ReadonlyArray<ObservedTab>,
  actualGroups: ReadonlyArray<ObservedTabGroup>,
  projection: TabGroupProjection,
): TabGroupSyncPlan => {
  const tabsById = new Map(actualTabs.map((tab) => [tab.id, tab]))
  const groupsById = new Map(actualGroups.map((group) => [group.id, group]))
  const targets = assignTabsToTargets(desired, tabsById)
  const targetOfTab = new Map(
    targets.flatMap((target) => target.tabIds.map((tabId) => [tabId, target] as const)),
  )
  const managedGroupIds = new Set(projection.map((entry) => entry.groupId))
  const memories = Array.dedupeWith(
    projection,
    (a, b) => isSameSpaceInWindow(a, b) || a.groupId === b.groupId,
  )

  // Not reused when all its tabs move to other Spaces' groups: Chrome deletes it once they move,
  // leaving the operations that follow pointing at a group that no longer exists
  const keepsSomeTab = (group: ObservedTabGroup, target: GroupTarget) =>
    actualTabs.some((tab) => {
      const owner = targetOfTab.get(tab.id)
      return isInGroup(tab, group.id) && (owner === undefined || owner === target)
    })

  const reusableGroupFor = (target: GroupTarget): Option.Option<ObservedTabGroup> =>
    Array.findFirst(memories, (memory) => isSameSpaceInWindow(memory, target)).pipe(
      Option.flatMap((memory) => Option.fromUndefinedOr(groupsById.get(memory.groupId))),
      Option.filter((group) => group.windowId === target.windowId && keepsSomeTab(group, target)),
    )

  const placements = targets.map((target) => ({ target, reusable: reusableGroupFor(target) }))

  const strayTabIds = actualTabs
    .filter(
      (tab) =>
        !targetOfTab.has(tab.id) &&
        Option.exists(tab.groupId, (groupId) => managedGroupIds.has(groupId)),
    )
    .map((tab) => tab.id)

  return {
    operations: [
      ...placements.flatMap(({ target, reusable }) =>
        Option.match(reusable, {
          onNone: () => [createGroupFor(target)],
          onSome: (group) => alignGroupWith(target, group, tabsById),
        }),
      ),
      ...(Array.isReadonlyArrayNonEmpty(strayTabIds)
        ? [{ _tag: "UngroupTabs", tabIds: strayTabIds } as const]
        : []),
    ],
    reusedGroups: placements.flatMap(({ target, reusable }) =>
      Option.toArray(
        Option.map(reusable, (group) => ({
          spaceId: target.spaceId,
          windowId: target.windowId,
          groupId: group.id,
        })),
      ),
    ),
  }
}
