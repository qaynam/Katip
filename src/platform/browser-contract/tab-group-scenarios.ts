import { Effect, Option } from "effect"
import { TabGroups, Tabs } from "#platform/browser"
import type { ContractSuite } from "./scenario"

export const tabGroupSuite: ContractSuite = {
  name: "tabs.group・tabs.ungroup・tabGroups.update",
  scenarios: [
    {
      name: "離れたタブをまとめると、先頭のタブの位置に左から順に並べてグループを作る",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, , c, , e],
          } = yield* stage.openWindow(["a", "b", "c", "d", "e"])

          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [e, a, c], windowId }))

          return yield* stage.observe({
            windows: [windowId],
            returned: () => stage.groupLabel(groupId),
          })
        }),
      expected: {
        groupEvents: ["created g1", 'updated g1 title="" collapsed=false'],
        returned: "g1",
        strip: ["a g1 active", "c g1", "e g1", "b", "d"],
        tabEvents: ["updated a group=g1", "updated c group=g1", "updated e group=g1"],
        moveEvents: ["c 2→1", "e 4→2"],
      },
    },
    {
      name: "既にあるグループに加えると、グループの末尾へ動いて入る",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, , d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.group({ tabIds: [d], groupId }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "b g1", "d g1", "c"],
        tabEvents: ["updated d group=g1"],
        moveEvents: ["d 3→2"],
      },
    },
    {
      name: "ピン留めしたタブをグループに入れると、ピン留めを外してから入る",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(b, { pinned: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ["created g1", 'updated g1 title="" collapsed=false'],
        strip: ["b g1", "a active", "c"],
        tabEvents: ["updated b pinned=false", "updated b group=g1"],
      },
    },
    {
      name: "別のウィンドウのタブをグループに入れると、グループのウィンドウの末尾へ移ってからグループへ動く",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId: first,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b", "c"])
          const {
            windowId: second,
            tabs: [x],
          } = yield* stage.openWindow(["x", "y"])
          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [a], windowId: first }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.group({ tabIds: [x], groupId }))

          return yield* stage.observe({ windows: [first, second] })
        }),
      expected: {
        strips: { w1: ["a g1 active", "x g1", "b", "c"], w2: ["y active"] },
        tabEvents: ["detached x w2@0", "activated y", "attached x w1@3", "updated x group=g1"],
        moveEvents: ["x 3→1"],
      },
    },
    {
      name: "グループの左半分のタブを外すと、グループの左へ出る",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c, d, e],
          } = yield* stage.openWindow(["a", "b", "c", "d", "e"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c, d, e], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.ungroup([c]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "c", "b g1", "d g1", "e g1"],
        tabEvents: ["updated c group=none"],
        moveEvents: ["c 2→1"],
      },
    },
    {
      name: "グループの右半分のタブを外すと、グループの右へ出る",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c, d, e],
          } = yield* stage.openWindow(["a", "b", "c", "d", "e"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c, d, e], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.ungroup([d]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "b g1", "c g1", "e g1", "d"],
        tabEvents: ["updated d group=none"],
        moveEvents: ["d 3→4"],
      },
    },
    {
      name: "グループのタブを全部外すと、グループもなくなる",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.ungroup([b, c]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ["removed g1"],
        strip: ["a active", "b", "c"],
        tabEvents: ["updated b group=none", "updated c group=none"],
      },
    },
    {
      name: "名前と色を変えると、変えた後のグループを返し、変化が 1 回届く",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])
          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [a], windowId }))
          yield* stage.skipEvents

          const updated = yield* TabGroups.use((groups) =>
            groups.update(groupId, { title: "Work", color: "red" }),
          )

          return yield* stage.observe({
            windows: [windowId],
            returned: () => ({
              title: Option.getOrNull(updated.title),
              color: updated.color,
              collapsed: updated.collapsed,
            }),
          })
        }),
      expected: {
        groupEvents: ['updated g1 title="Work" collapsed=false'],
        returned: { title: "Work", color: "red", collapsed: false },
        strip: ["a g1 active", "b"],
      },
    },
    {
      name: "アクティブなタブを含むグループを折りたたんでも、アクティブなタブは変わらない",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [a, b], windowId }))
          yield* stage.skipEvents

          yield* TabGroups.use((groups) => groups.update(groupId, { collapsed: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ['updated g1 title="" collapsed=true'],
        strip: ["a g1 active", "b g1", "c"],
      },
    },
    {
      name: "折りたたんだグループのタブをアクティブにすると、グループが開いてからアクティブになる",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          const groupId = yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* TabGroups.use((groups) => groups.update(groupId, { collapsed: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.update(c, { active: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ['updated g1 title="" collapsed=false'],
        strip: ["a", "b g1", "c g1 active"],
        tabEvents: ["activated c"],
      },
    },
  ],
}
