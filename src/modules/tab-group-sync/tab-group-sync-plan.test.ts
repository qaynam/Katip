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

const spaceAppearance: GroupAppearance = { title: "仕事", color: "blue", collapsed: false }

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

// Chrome と同じく、空になったグループは消え、消えたグループへの操作は失敗し、
// グループに入れた固定タブは固定が外れる
const applyPlan = (state: BrowserState, plan: TabGroupSyncPlan): BrowserState => {
  let tabs = state.tabs
  let groups = state.groups
  let created: TabGroupProjection = []
  let nextGroupId = Math.max(1000, ...groups.map((g) => g.id + 1))

  const requireGroup = (groupId: TabGroupId) => {
    const found = groups.find((g) => g.id === groupId)
    if (found === undefined) throw new Error(`グループ ${groupId} はもう存在しない`)
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
  describe("Space のグループを記憶していないとき", () => {
    it("Space のタブを、そのウィンドウの新しいグループにまとめる", () => {
      const work = desired("work", [1, 2], { title: "仕事", color: "red", collapsed: true })

      const plan = planTabGroupSync([work], [tab(1), tab(2)], [], [])

      expect(plan.operations).toStrictEqual([
        {
          _tag: "CreateGroup",
          spaceId: "work",
          windowId: 1,
          tabIds: [1, 2],
          appearance: { title: "仕事", color: "red", collapsed: true },
        },
      ])
    })

    it("新しく作るグループは、再利用する対応に含めない", () => {
      const plan = planTabGroupSync([desired("work", [1])], [tab(1)], [], [])

      expect(plan.reusedGroups).toStrictEqual([])
    })
  })

  describe("記憶しているグループが、そのウィンドウにもう無いとき", () => {
    it("グループが閉じられていたら、新しいグループを作る", () => {
      const plan = planTabGroupSync([desired("work", [1])], [tab(1)], [], [remembered("work", 10)])

      expect(plan.operations.map((o) => o._tag)).toStrictEqual(["CreateGroup"])
    })

    it("グループが別のウィンドウへ移っていたら、このウィンドウに新しいグループを作る", () => {
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

  describe("記憶しているグループが、そのウィンドウに残っているとき", () => {
    it("タブも見た目も揃っていれば、何もしない", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1, 2])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([])
    })

    it("グループの外にある Space のタブだけを、そのグループに入れる", () => {
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

    it("Katip の管理外のグループにある Space のタブも、Space のグループへ移す", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 20 })]
      const groups = [group(10), group(20, { title: "ユーザーのグループ" })]

      const plan = planTabGroupSync([desired("work", [1, 2])], tabs, groups, [
        remembered("work", 10),
      ])

      expect(plan.operations).toStrictEqual([{ _tag: "AddTabsToGroup", groupId: 10, tabIds: [2] }])
    })

    it.each<[string, Partial<GroupAppearance>]>([
      ["タイトル", { title: "旧い名前" }],
      ["色", { color: "green" }],
      ["折りたたみ", { collapsed: true }],
    ])("%sがずれていれば、あるべき見た目に更新する", (_, drift) => {
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

    it("タイトルの無いグループには、Space の名前を付ける", () => {
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

    it("グループ内のタブの並びが Space の順と違っても、並べ替えない", () => {
      const tabs = [tab(3, { group: 10 }), tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1, 2, 3])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([])
    })

    it("再利用するグループを対応表に残す", () => {
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

  describe("Katip のグループに、その Space に属さないタブが残っているとき", () => {
    it("どの Space にも属さなくなったタブを、グループから外す", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync(
        [desired("work", [1])],
        tabs,
        [group(10)],
        [remembered("work", 10)],
      )

      expect(plan.operations).toStrictEqual([{ _tag: "UngroupTabs", tabIds: [2] }])
    })

    it("別の Space に移ったタブは、外さずに移った先のグループへ入れる", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })]

      const plan = planTabGroupSync(
        [desired("work", [1]), desired("home", [2, 3])],
        tabs,
        [group(10), group(20)],
        [remembered("work", 10), remembered("home", 20)],
      )

      expect(plan.operations).toStrictEqual([{ _tag: "AddTabsToGroup", groupId: 20, tabIds: [2] }])
    })

    it("Space のタブが 1 つも無くなったグループからも、残ったタブを外す", () => {
      const tabs = [tab(1, { group: 10 }), tab(2, { group: 10 })]

      const plan = planTabGroupSync([], tabs, [group(10)], [remembered("work", 10)])

      expect(plan.operations).toStrictEqual([{ _tag: "UngroupTabs", tabIds: [1, 2] }])
    })

    it("あるべき姿に無い Space・ウィンドウの対応は、対応表から消える", () => {
      const tabs = [tab(1, { group: 10 })]

      const plan = planTabGroupSync([], tabs, [group(10)], [remembered("work", 10)])

      expect(plan.reusedGroups).toStrictEqual([])
    })
  })

  describe("Katip が管理していないグループ", () => {
    it("見た目を変えない", () => {
      const tabs = [tab(1, { group: 20 })]
      const userGroup = group(20, { title: "仕事", color: "red", collapsed: true })

      const plan = planTabGroupSync([], tabs, [userGroup], [])

      expect(plan.operations).toStrictEqual([])
    })

    it("Space に属さないタブを外さない", () => {
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

  describe("複数のウィンドウ", () => {
    it("同じ Space でも、ウィンドウごとに別のグループにする", () => {
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

    it("別のウィンドウにあるタブは、このウィンドウのグループに入れない", () => {
      const tabs = [tab(1, { window: 1 }), tab(2, { window: 2 })]

      const plan = planTabGroupSync([desired("work", [1, 2], { window: 1 })], tabs, [], [])

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", windowId: 1, tabIds: [1] }),
      ])
    })

    it("そのウィンドウに Space のタブが 1 つも無ければ、グループを作らない", () => {
      const tabs = [tab(2, { window: 2 })]

      const plan = planTabGroupSync([desired("work", [1, 2], { window: 1 })], tabs, [], [])

      expect(plan.operations).toStrictEqual([])
    })
  })

  describe("Chrome で固定されたタブ", () => {
    it("Space に指定されていても、グループに入れない", () => {
      const tabs = [tab(1, { pinned: true }), tab(2)]

      const plan = planTabGroupSync([desired("work", [1, 2])], tabs, [], [])

      expect(plan.operations).toStrictEqual([
        expect.objectContaining({ _tag: "CreateGroup", tabIds: [2] }),
      ])
    })
  })

  describe("矛盾した入力", () => {
    it("同じタブが複数の Space に指定されていたら、先に指定された Space のグループに入れる", () => {
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

    it("同じ Space・ウィンドウが重複して指定されていたら、先の指定だけに従う", () => {
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

    it("1 つのグループを複数の Space の記憶が指していたら、先に記憶した Space だけが再利用する", () => {
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

  describe("計画の実行結果", () => {
    const work = (tabIds: ReadonlyArray<number>, overrides: Partial<GroupAppearance> = {}) =>
      desired("work", tabIds, overrides)
    const home = (tabIds: ReadonlyArray<number>, overrides: Partial<GroupAppearance> = {}) =>
      desired("home", tabIds, { title: "家", color: "green", ...overrides })

    it.each<[string, ReadonlyArray<DesiredGroup>, BrowserState]>([
      [
        "グループが 1 つも無い",
        [work([1, 2]), home([3], { collapsed: true })],
        { tabs: [tab(1), tab(2), tab(3)], groups: [], projection: [] },
      ],
      [
        "タブが Space をまたいで移った",
        [work([1]), home([2, 3])],
        {
          tabs: [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })],
          groups: [group(10), group(20, { title: "家", color: "green" })],
          projection: [remembered("work", 10), remembered("home", 20)],
        },
      ],
      [
        "Space から外れたタブと、ユーザーのグループにある Space のタブがある",
        [work([1, 3])],
        {
          tabs: [tab(1, { group: 10 }), tab(2, { group: 10 }), tab(3, { group: 20 })],
          groups: [group(10), group(20, { title: "ユーザー" })],
          projection: [remembered("work", 10)],
        },
      ],
      [
        "Space が別のウィンドウにもある",
        [work([1]), desired("work", [2], { window: 2 })],
        {
          tabs: [tab(1, { window: 1 }), tab(2, { window: 2 })],
          groups: [],
          projection: [],
        },
      ],
    ])("%s状態から同期したあとに再び計画すると、操作は 0 件になる", (_, desiredGroups, before) => {
      const { second } = syncTwice(desiredGroups, before)

      expect(second.operations).toStrictEqual([])
    })

    it("2 つの Space のグループの中身が入れ替わっていても、1 回の同期で揃う", () => {
      const before: BrowserState = {
        tabs: [tab(1, { group: 10 }), tab(2, { group: 20 })],
        groups: [group(10), group(20, { title: "家", color: "green" })],
        projection: [remembered("work", 10), remembered("home", 20)],
      }

      const { after, second } = syncTwice([work([2]), home([1])], before)

      expect(second.operations).toStrictEqual([])
      expect(groupOf(after, 1)).not.toBe(groupOf(after, 2))
    })
  })

  describe("任意の状態からの同期", () => {
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
      "実行後にもう一度計画すると、操作は 0 件になる",
      { scenario: Scenario },
      ({ scenario }) => {
        const { desiredGroups, before } = arrange(scenario)

        const { second } = syncTwice(desiredGroups, before)

        expect(second.operations).toStrictEqual([])
      },
    )

    it.prop("Chrome で固定されたタブの固定は外れない", { scenario: Scenario }, ({ scenario }) => {
      const { desiredGroups, before } = arrange(scenario)

      const { after } = syncTwice(desiredGroups, before)

      expect(after.tabs.map((t) => t.pinned)).toStrictEqual(before.tabs.map((t) => t.pinned))
    })

    it.prop("タブはウィンドウをまたいで移らない", { scenario: Scenario }, ({ scenario }) => {
      const { desiredGroups, before } = arrange(scenario)

      const { after } = syncTwice(desiredGroups, before)

      expect(after.tabs.map((t) => t.windowId)).toStrictEqual(before.tabs.map((t) => t.windowId))
    })

    it.prop(
      "Katip が管理していないグループの見た目は変わらない",
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
      "Space のタブはウィンドウごとに 1 つのグループにまとまり、そのグループはあるべき見た目になる",
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
      "同期後に残る Katip のグループには、そのグループの Space のタブしか入っていない",
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
