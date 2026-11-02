import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { SpaceId } from "#modules/space"
import { TabGroupId, TabId, WindowId } from "#platform/browser"
import type { TabGroupProjection } from "./tab-group-projection"
import {
  planTabGroupSync,
  type DesiredGroup,
  type GroupAppearance,
  type ObservedTab,
  type ObservedTabGroup,
  type TabGroupSyncPlan,
} from "./tab-group-sync-plan"

const tab = (
  id: number,
  place: { window?: number; group?: number; pinned?: boolean } = {},
): ObservedTab => ({
  id: TabId.make(id),
  windowId: WindowId.make(place.window ?? 1),
  groupId: Option.fromUndefinedOr(place.group).pipe(Option.map(TabGroupId.make)),
  pinned: place.pinned ?? false,
})

const spaceAppearance: GroupAppearance = { title: "Work", color: "blue", collapsed: false }

const chromeTitle = (title: string) => Option.some(title).pipe(Option.filter((t) => t !== ""))

const styled = (group: ObservedTabGroup, appearance: GroupAppearance): ObservedTabGroup => ({
  ...group,
  ...appearance,
  title: chromeTitle(appearance.title),
})

const appearanceOf = (group: ObservedTabGroup | undefined): GroupAppearance | undefined =>
  group && {
    title: Option.getOrElse(group.title, () => ""),
    color: group.color,
    collapsed: group.collapsed,
  }

const group = (
  id: number,
  overrides: Partial<GroupAppearance> & { window?: number } = {},
): ObservedTabGroup => {
  const { title, color, collapsed } = { ...spaceAppearance, ...overrides }
  return {
    id: TabGroupId.make(id),
    windowId: WindowId.make(overrides.window ?? 1),
    title: chromeTitle(title),
    color,
    collapsed,
  }
}

const desired = (
  spaceId: string,
  tabIds: ReadonlyArray<number>,
  overrides: Partial<GroupAppearance> & { window?: number } = {},
): DesiredGroup => ({
  ...spaceAppearance,
  ...overrides,
  spaceId: SpaceId.make(spaceId),
  windowId: WindowId.make(overrides.window ?? 1),
  tabIds: tabIds.map((id) => TabId.make(id)),
})

const remembered = (spaceId: string, groupId: number, window = 1): TabGroupProjection[number] => ({
  spaceId: SpaceId.make(spaceId),
  windowId: WindowId.make(window),
  groupId: TabGroupId.make(groupId),
})

interface BrowserState {
  readonly tabs: ReadonlyArray<ObservedTab>
  readonly groups: ReadonlyArray<ObservedTabGroup>
  readonly projection: TabGroupProjection
}

// As in Chrome, an emptied group disappears, an operation on a gone group fails, and a pinned tab
// put in a group is unpinned
const applyPlan = (state: BrowserState, plan: TabGroupSyncPlan): BrowserState => {
  let tabs = state.tabs
  let groups = state.groups
  let created: TabGroupProjection = []
  let nextGroupId = Math.max(1000, ...groups.map((g) => g.id + 1))

  const requireGroup = (groupId: TabGroupId) => {
    const found = groups.find((g) => g.id === groupId)
    if (found === undefined) throw new Error(`Group ${groupId} no longer exists`)
    return found
  }
  const moveIntoGroup = (tabIds: ReadonlyArray<TabId>, target: ObservedTabGroup) => {
    tabs = tabs.map((t) =>
      tabIds.includes(t.id)
        ? { ...t, windowId: target.windowId, groupId: Option.some(target.id), pinned: false }
        : t,
    )
  }
  const dropEmptyGroups = () => {
    groups = groups.filter((g) => tabs.some((t) => Option.contains(t.groupId, g.id)))
  }
  const restyle = (groupId: TabGroupId, appearance: GroupAppearance) => {
    requireGroup(groupId)
    groups = groups.map((g) => (g.id === groupId ? styled(g, appearance) : g))
  }

  for (const operation of plan.operations) {
    switch (operation._tag) {
      case "CreateGroup": {
        const newGroup: ObservedTabGroup = {
          id: TabGroupId.make(nextGroupId++),
          windowId: operation.windowId,
          title: Option.none(),
          color: "grey",
          collapsed: false,
        }
        groups = [...groups, newGroup]
        moveIntoGroup(operation.tabIds, newGroup)
        dropEmptyGroups()
        created = [
          ...created,
          { spaceId: operation.spaceId, windowId: operation.windowId, groupId: newGroup.id },
        ]
        restyle(newGroup.id, operation.appearance)
        break
      }
      case "AddTabsToGroup":
        moveIntoGroup(operation.tabIds, requireGroup(operation.groupId))
        dropEmptyGroups()
        break
      case "UpdateGroup":
        restyle(operation.groupId, operation.appearance)
        break
      case "UngroupTabs":
        tabs = tabs.map((t) =>
          operation.tabIds.includes(t.id) ? { ...t, groupId: Option.none() } : t,
        )
        dropEmptyGroups()
        break
    }
  }
  return { tabs, groups, projection: [...plan.reusedGroups, ...created] }
}

const syncTwice = (desiredGroups: ReadonlyArray<DesiredGroup>, before: BrowserState) => {
  const first = planTabGroupSync(desiredGroups, before.tabs, before.groups, before.projection)
  const after = applyPlan(before, first)
  const second = planTabGroupSync(desiredGroups, after.tabs, after.groups, after.projection)
  return { first, after, second }
}

const groupOf = (state: BrowserState, tabId: number) =>
  state.tabs.find((t) => t.id === tabId)?.groupId.pipe(Option.getOrUndefined)

describe("planTabGroupSync", () => {
  describe("when no group is remembered for the Space", () => {
    it("gathers the Space's tabs into a new group in their window", () => {
      const work = desired("work", [1, 2], { title: "Work", color: "red", collapsed: true })

      const plan = planTabGroupSync([work], [tab(1), tab(2)], [], [])

      expect(plan.operations).toStrictEqual([
        {
          _tag: "CreateGroup",
          spaceId: "work",
          windowId: 1,
          tabIds: [1, 2],
          appearance: { title: "Work", color: "red", collapsed: true },
        },
      ])
    })

    it("leaves groups to be created out of the reused groups", () => {
      const plan = planTabGroupSync([desired("work", [1])], [tab(1)], [], [])

      expect(plan.reusedGroups).toStrictEqual([])
    })
  })

  describe("when the remembered group is no longer in the window", () => {
    it("creates a new group when the group was closed", () => {
      const plan = planTabGroupSync([desired("work", [1])], [tab(1)], [], [remembered("work", 10)])

      expect(plan.operations.map((o) => o._tag)).toStrictEqual(["CreateGroup"])
    })

    it("creates a new group in this window when the group moved to another window", () => {
      const tabs = [tab(1, { window: 1 }), tab(2, { window: 2, group: 10 })]
      const groups = [group(10, { window: 2 })]

      const plan = planTabGroupSync([desired("work", [1], { window: 1 })], tabs, groups, [
        remembered("work", 10, 1),
      ])

      expect(plan.operations).toContainEqual(
        expect.objectContaining({ _tag: "CreateGroup", windowId: 1, tabIds: [1] }),
      )
      expect(plan.reusedGroups).toStrictEqual([])
    })
  })

  describe("when the remembered group is still in the window", () => {
    it("does nothing when the tabs and the appearance already match", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1, 2])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([])
    })

    it("adds only the Space's tabs outside the group to it", () => {
      const tabs = [tab(1, { group: 10 }), tab(2), tab(3, { group: 10 }), tab(4)]

      const plan = planTabGroupSync(
        [desired("work", [1, 2, 3, 4])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([
        { _tag: "AddTabsToGroup", groupId: 10, tabIds: [2, 4] },
      ])
    })

    it("moves the Space's tabs in a group Katip doesn't manage to the Space's group too", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 20 })]
      const groups = [group(10), group(20, { title: "User's group" })]

      const plan = planTabGroupSync([desired("work", [1, 2])], tabs, groups, [
        remembered("work", 10),
      ])

      expect(plan.operations).toStrictEqual([{ _tag: "AddTabsToGroup", groupId: 10, tabIds: [2] }])
    })

    it.each<[string, Partial<GroupAppearance>]>([
      ["title", { title: "Old name" }],
      ["color", { color: "green" }],
      ["collapsed state", { collapsed: true }],
    ])("updates the group to the desired appearance when its %s drifted", (_, drift) => {
      const tabs = [tab(1, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10, drift)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([
        { _tag: "UpdateGroup", groupId: 10, appearance: spaceAppearance },
      ])
    })

    it("gives a group without a title the Space's name", () => {
      const tabs = [tab(1, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10, { title: "" })],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([
        { _tag: "UpdateGroup", groupId: 10, appearance: spaceAppearance },
      ])
    })

    it("doesn't reorder the tabs in a group even when they differ from the Space's order", () => {
      const tabs = [tab(3, { group: 10 }), tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1, 2, 3])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([])
    })

    it("keeps a reused group in the projection", () => {
      const tabs = [tab(1, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.reusedGroups).toStrictEqual([remembered("work", 10)])
    })
  })

  describe("when a Katip group still holds tabs not in its Space", () => {
    it("ungroups a tab that is no longer in any Space", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([{ _tag: "UngroupTabs", tabIds: [2] }])
    })

    it("moves a tab that changed Spaces into its new Space's group instead of ungrouping it", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })]

      const plan = planTabGroupSync(
        [desired("work", [1]), desired("home", [2, 3])],
        tabs,
        [group(10), group(20)],
        [remembered("work", 10), remembered("home", 20)],
      )

      expect(plan.operations).toStrictEqual([{ _tag: "AddTabsToGroup", groupId: 20, tabIds: [2] }])
    })

    it("ungroups the remaining tabs from a group whose Space has no tab left too", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync([], tabs, [group(10)], [remembered("work", 10)])

      expect(plan.operations).toStrictEqual([{ _tag: "UngroupTabs", tabIds: [1, 2] }])
    })

    it("drops the projection entry of a Space and window not in the desired groups", () => {
      const tabs = [tab(1, { group: 10 })]

      const plan = planTabGroupSync([], tabs, [group(10)], [remembered("work", 10)])

      expect(plan.reusedGroups).toStrictEqual([])
    })
  })

  describe("groups Katip doesn't manage", () => {
    it("keeps their appearance", () => {
      const tabs = [tab(1, { group: 20 })]
      const userGroup = group(20, { title: "Work", color: "red", collapsed: true })

      const plan = planTabGroupSync([], tabs, [userGroup], [])

      expect(plan.operations).toStrictEqual([])
    })

    it("doesn't ungroup tabs that aren't in a Space", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 20 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10), group(20)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([])
    })
  })

  describe("several windows", () => {
    it("makes a separate group per window, even for the same Space", () => {
      const tabs = [tab(1, { window: 1 }), tab(2, { window: 2 })]

      const plan = planTabGroupSync(
        [desired("work", [1], { window: 1 }), desired("work", [2], { window: 2 })],
        tabs,
        [],
        [],
      )

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", windowId: 1, tabIds: [1] }),
        expect.objectContaining({ _tag: "CreateGroup", windowId: 2, tabIds: [2] }),
      ])
    })

    it("doesn't put a tab from another window into this window's group", () => {
      const tabs = [tab(1, { window: 1 }), tab(2, { window: 2 })]

      const plan = planTabGroupSync([desired("work", [1, 2], { window: 1 })], tabs, [], [])

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", windowId: 1, tabIds: [1] }),
      ])
    })

    it("creates no group in a window without any of the Space's tabs", () => {
      const tabs = [tab(2, { window: 2 })]

      const plan = planTabGroupSync([desired("work", [1, 2], { window: 1 })], tabs, [], [])

      expect(plan.operations).toStrictEqual([])
    })
  })

  describe("tabs pinned in Chrome", () => {
    it("never join a group, even when listed for a Space", () => {
      const tabs = [tab(1, { pinned: true }), tab(2)]

      const plan = planTabGroupSync([desired("work", [1, 2])], tabs, [], [])

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", tabIds: [2] }),
      ])
    })
  })

  describe("conflicting input", () => {
    it("puts a tab listed for several Spaces into the group of the Space listed first", () => {
      const plan = planTabGroupSync(
        [desired("work", [1, 2]), desired("home", [2, 3])],
        [tab(1), tab(2), tab(3)],
        [],
        [],
      )

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", spaceId: "work", tabIds: [1, 2] }),
        expect.objectContaining({ _tag: "CreateGroup", spaceId: "home", tabIds: [3] }),
      ])
    })

    it("follows only the first of duplicate entries for the same Space and window", () => {
      const plan = planTabGroupSync(
        [desired("work", [1]), desired("work", [2])],
        [tab(1), tab(2)],
        [],
        [],
      )

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", spaceId: "work", tabIds: [1] }),
      ])
    })

    it("when several Spaces remember the same group, only the Space remembered first reuses it", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("home", [2]), desired("work", [1])],
        tabs,
        [group(10)],
        [remembered("work", 10), remembered("home", 10)],
      )

      expect(plan.reusedGroups).toStrictEqual([remembered("work", 10)])
      expect(plan.operations).toContainEqual(
        expect.objectContaining({ _tag: "CreateGroup", spaceId: "home", tabIds: [2] }),
      )
    })
  })

  describe("result of carrying out the plan", () => {
    const work = (tabIds: ReadonlyArray<number>, overrides: Partial<GroupAppearance> = {}) =>
      desired("work", tabIds, overrides)
    const home = (tabIds: ReadonlyArray<number>, overrides: Partial<GroupAppearance> = {}) =>
      desired("home", tabIds, { title: "Home", color: "green", ...overrides })

    it.each<[string, ReadonlyArray<DesiredGroup>, BrowserState]>([
      [
        "no groups at all",
        [work([1, 2]), home([3], { collapsed: true })],
        { tabs: [tab(1), tab(2), tab(3)], groups: [], projection: [] },
      ],
      [
        "tabs that moved across Spaces",
        [work([1]), home([2, 3])],
        {
          tabs: [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })],
          groups: [group(10), group(20, { title: "Home", color: "green" })],
          projection: [remembered("work", 10), remembered("home", 20)],
        },
      ],
      [
        "a tab that left its Space and a Space's tab in the user's group",
        [work([1, 3])],
        {
          tabs: [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })],
          groups: [group(10), group(20, { title: "User" })],
          projection: [remembered("work", 10)],
        },
      ],
      [
        "a Space in another window too",
        [work([1]), desired("work", [2], { window: 2 })],
        {
          tabs: [tab(1, { window: 1 }), tab(2, { window: 2 })],
          groups: [],
          projection: [],
        },
      ],
    ])(
      "after syncing from a state with %s, planning again yields no operations",
      (_, desiredGroups, before) => {
        const { second } = syncTwice(desiredGroups, before)

        expect(second.operations).toStrictEqual([])
      },
    )

    it("one sync is enough even when two Spaces' groups have swapped their tabs", () => {
      const before: BrowserState = {
        tabs: [tab(1, { group: 10 }), tab(2, { group: 20 })],
        groups: [group(10), group(20, { title: "Home", color: "green" })],
        projection: [remembered("work", 10), remembered("home", 20)],
      }

      const { after, second } = syncTwice([work([2]), home([1])], before)

      expect(second.operations).toStrictEqual([])
      expect(groupOf(after, 1)).not.toBe(groupOf(after, 2))
    })
  })

  describe("syncing from any state", () => {
    const spaces = ["a", "b", "c"] as const
    const windows = [1, 2] as const
    const groupSlots = [10, 11, 20, 21] as const
    const windowOfGroup = (groupId: number) => (groupId < 20 ? 1 : 2)
    const colorOfSpace = (space: string) => (space === "b" ? "grey" : "blue")

    const Appearance = Schema.Struct({
      title: Schema.Literals(["", ...spaces]),
      color: Schema.Literals(["grey", "blue"]),
      collapsed: Schema.Boolean,
    })
    const Scenario = Schema.Struct({
      tabs: Schema.Array(
        Schema.Struct({
          window: Schema.Literals(windows),
          group: Schema.Literals([0, ...groupSlots]),
          space: Schema.Literals(["", ...spaces]),
          pinned: Schema.Boolean,
          alsoListedInOtherWindow: Schema.Boolean,
        }),
      ).check(Schema.isMaxLength(10)),
      groupAppearances: Schema.Tuple([Appearance, Appearance, Appearance, Appearance]),
      memories: Schema.Array(
        Schema.Struct({
          space: Schema.Literals(spaces),
          window: Schema.Literals(windows),
          group: Schema.Literals([...groupSlots, 99]),
        }),
      ).check(Schema.isMaxLength(6)),
      activeSpaces: Schema.Tuple([Schema.Literals(spaces), Schema.Literals(spaces)]),
    })
    type Scenario = typeof Scenario.Type

    const arrange = (scenario: Scenario) => {
      const tabs = scenario.tabs.map((seed, index) =>
        seed.group === 0 || seed.pinned
          ? tab(index + 1, { window: seed.window, pinned: seed.pinned })
          : tab(index + 1, { window: windowOfGroup(seed.group), group: seed.group }),
      )
      const groups = groupSlots.flatMap((groupId, slot) =>
        tabs.some((t) => Option.contains(t.groupId, TabGroupId.make(groupId)))
          ? [group(groupId, { ...scenario.groupAppearances[slot], window: windowOfGroup(groupId) })]
          : [],
      )
      const desiredGroups = spaces.flatMap((space) =>
        windows.map((window) =>
          desired(
            space,
            tabs
              .filter((t, index) => {
                const seed = scenario.tabs[index]
                return (
                  seed?.space === space && (t.windowId === window || seed.alsoListedInOtherWindow)
                )
              })
              .map((t) => t.id),
            {
              window,
              title: space,
              color: colorOfSpace(space),
              collapsed: scenario.activeSpaces[window - 1] !== space,
            },
          ),
        ),
      )
      const projection = scenario.memories.map((m) => remembered(m.space, m.group, m.window))
      return { desiredGroups, before: { tabs, groups, projection } satisfies BrowserState }
    }

    it.prop(
      "planning again after carrying out the plan yields no operations",
      { scenario: Scenario },
      ({ scenario }) => {
        const { desiredGroups, before } = arrange(scenario)

        const { second } = syncTwice(desiredGroups, before)

        expect(second.operations).toStrictEqual([])
      },
    )

    it.prop("tabs pinned in Chrome stay pinned", { scenario: Scenario }, ({ scenario }) => {
      const { desiredGroups, before } = arrange(scenario)

      const { after } = syncTwice(desiredGroups, before)

      expect(after.tabs.map((t) => t.pinned)).toStrictEqual(before.tabs.map((t) => t.pinned))
    })

    it.prop("tabs never move across windows", { scenario: Scenario }, ({ scenario }) => {
      const { desiredGroups, before } = arrange(scenario)

      const { after } = syncTwice(desiredGroups, before)

      expect(after.tabs.map((t) => t.windowId)).toStrictEqual(before.tabs.map((t) => t.windowId))
    })

    it.prop(
      "groups Katip doesn't manage keep their appearance",
      { scenario: Scenario },
      ({ scenario }) => {
        const { desiredGroups, before } = arrange(scenario)
        const managed = new Set(before.projection.map((m) => m.groupId))
        const unmanagedBefore = before.groups.filter((g) => !managed.has(g.id))

        const { after } = syncTwice(desiredGroups, before)

        const unmanagedAfter = after.groups.filter((g) =>
          unmanagedBefore.some((u) => u.id === g.id),
        )
        for (const survivor of unmanagedAfter) {
          expect(unmanagedBefore).toContainEqual(survivor)
        }
      },
    )

    it.prop(
      "a Space's tabs end up in one group per window, and that group has the desired appearance",
      { scenario: Scenario },
      ({ scenario }) => {
        const { desiredGroups, before } = arrange(scenario)

        const { after } = syncTwice(desiredGroups, before)

        const placed = desiredGroups.flatMap((d) => {
          const tabsHere = after.tabs.filter(
            (t) => d.tabIds.includes(t.id) && t.windowId === d.windowId && !t.pinned,
          )
          const groupIds = new Set(tabsHere.map((t) => Option.getOrUndefined(t.groupId)))
          return tabsHere.length === 0 ? [] : [{ d, groupIds }]
        })
        for (const { d, groupIds } of placed) {
          expect(groupIds.size).toBe(1)
          const [groupId] = groupIds
          expect(appearanceOf(after.groups.find((g) => g.id === groupId))).toStrictEqual({
            title: d.title,
            color: d.color,
            collapsed: d.collapsed,
          })
        }
        const distinctGroups = new Set(placed.flatMap(({ groupIds }) => [...groupIds]))
        expect(distinctGroups.size).toBe(placed.length)
      },
    )

    it.prop(
      "Katip groups left after the sync hold only tabs of their own Space",
      { scenario: Scenario },
      ({ scenario }) => {
        const { desiredGroups, before } = arrange(scenario)

        const { after } = syncTwice(desiredGroups, before)

        const katipGroupIds = new Set(
          [...before.projection, ...after.projection].map((m) => m.groupId),
        )
        for (const t of after.tabs) {
          const groupId = Option.getOrUndefined(t.groupId)
          if (groupId === undefined || !katipGroupIds.has(groupId)) continue
          const owner = after.projection.find((m) => m.groupId === groupId)
          const ownerDesired = desiredGroups.find(
            (d) => d.spaceId === owner?.spaceId && d.windowId === owner.windowId,
          )
          expect(ownerDesired?.tabIds).toContain(t.id)
        }
      },
    )
  })
})
