import { Effect } from "effect"
import { Tabs } from "#platform/browser"
import type { ContractSuite } from "./scenario"

export const tabMoveSuite: ContractSuite = {
  name: "tabs.move",
  scenarios: [
    {
      name: "moving a single tab still returns an array with that one tab",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b", "c"])

          const moved = yield* Tabs.use((tabs) => tabs.move([a], { index: 2 }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["a@2 active"],
        strip: ["b", "c", "a active"],
        moveEvents: ["a 0→2"],
      },
    },
    {
      name: "moving several tabs places each one right after where the previous one landed",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, , d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])

          const moved = yield* Tabs.use((tabs) => tabs.move([d, b], { index: 0 }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["d@0", "b@1"],
        strip: ["d", "b", "a active", "c"],
        moveEvents: ["d 3→0", "b 2→1"],
      },
    },
    {
      name: "moving several tabs to the end keeps their order and returns each tab as of its own move",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c", "d"])

          const moved = yield* Tabs.use((tabs) => tabs.move([a, b], { index: "end" }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["a@3 active", "b@3"],
        strip: ["c", "d", "a active", "b"],
        moveEvents: ["a 0→3", "b 0→3"],
      },
    },
    {
      name: "an index beyond the tab count moves the tab to the end",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b", "c"])

          yield* Tabs.use((tabs) => tabs.move([a], { index: 99 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["b", "c", "a active"], moveEvents: ["a 0→2"] },
    },
    {
      name: "an unpinned tab moved into the pinned area stops right after it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, , c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          const moved = yield* Tabs.use((tabs) => tabs.move([c], { index: 0 }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["c@1"],
        strip: ["a pinned active", "c", "b"],
        moveEvents: ["c 2→1"],
      },
    },
    {
      name: "a pinned tab moved out of the pinned area stops at its end",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) =>
            Effect.andThen(tabs.update(a, { pinned: true }), tabs.update(b, { pinned: true })),
          )
          yield* stage.skipEvents

          const moved = yield* Tabs.use((tabs) => tabs.move([a], { index: 2 }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["a@1 pinned active"],
        strip: ["b pinned", "a pinned active", "c"],
        moveEvents: ["a 0→1"],
      },
    },
    {
      name: "moving pinned and unpinned tabs together keeps each inside its own area",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b, , d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* Tabs.use((tabs) =>
            Effect.andThen(tabs.update(a, { pinned: true }), tabs.update(b, { pinned: true })),
          )
          yield* stage.skipEvents

          const moved = yield* Tabs.use((tabs) => tabs.move([a, d], { index: 3 }))

          return yield* stage.observe({ windows: [windowId], returned: () => moved.map(stage.tab) })
        }),
      expected: {
        returned: ["a@1 pinned active", "d@2"],
        strip: ["b pinned", "a pinned active", "d", "c"],
        moveEvents: ["a 0→1", "d 3→2"],
      },
    },
    {
      name: "moving a tab into the middle of a group joins the group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c, d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([d], { index: 2 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "b g1", "d g1", "c g1"],
        tabEvents: ["updated d group=g1"],
        moveEvents: ["d 3→2"],
      },
    },
    {
      name: "moving a tab out of its group leaves the group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [a, b], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([a], { index: 2 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["b g1", "c", "a active"],
        tabEvents: ["updated a group=none"],
        moveEvents: ["a 0→2"],
      },
    },
    {
      name: "moving a tab to the boundary between an ungrouped tab and a group does not join the group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, , c, d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [c, d], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([a], { index: 1 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["b", "a active", "c g1", "d g1"], moveEvents: ["a 0→1"] },
    },
    {
      name: "moving to another window detaches the tab and attaches it there",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId: first,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          const { windowId: second } = yield* stage.openWindow(["x"])

          yield* Tabs.use((tabs) => tabs.move([b], { windowId: second, index: 0 }))

          return yield* stage.observe({ windows: [first, second] })
        }),
      expected: {
        strips: { w1: ["a active", "c"], w2: ["b", "x active"] },
        tabEvents: ["detached b w1@1", "attached b w2@0"],
      },
    },
    {
      name: "moving a pinned tab to another window unpins it before moving",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId: first,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          const { windowId: second } = yield* stage.openWindow(["x"])
          yield* Tabs.use((tabs) => tabs.update(b, { pinned: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([b], { windowId: second, index: "end" }))

          return yield* stage.observe({ windows: [first, second] })
        }),
      expected: {
        strips: { w1: ["a active", "c"], w2: ["x active", "b"] },
        tabEvents: ["updated b pinned=false", "detached b w1@0", "attached b w2@1"],
      },
    },
    {
      name: "moving a grouped tab to another window ungroups it before moving",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId: first,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          const { windowId: second } = yield* stage.openWindow(["x"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId: first }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([b], { windowId: second, index: "end" }))

          return yield* stage.observe({ windows: [first, second] })
        }),
      expected: {
        strips: { w1: ["a active", "c g1"], w2: ["x active", "b"] },
        tabEvents: ["updated b group=none", "detached b w1@1", "attached b w2@1"],
      },
    },
  ],
}
