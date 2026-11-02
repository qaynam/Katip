import { Effect } from "effect"
import { type TabId, Tabs, Windows } from "#platform/browser"
import type { ContractScenario, ContractSuite } from "./scenario"
import { pageUrl } from "./stage"

const splitPair = (tabIds: readonly [TabId, TabId]) => Tabs.use((tabs) => tabs.createSplit(tabIds))

const withSplitView = (scenario: Omit<ContractScenario, "splitView">): ContractScenario => ({
  ...scenario,
  splitView: "available",
})

export const splitViewSuite: ContractSuite = {
  name: "split view",
  scenarios: [
    withSplitView({
      name: "splitting two adjacent tabs emits the split for the left tab first, regardless of argument order",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])

          const splitViewId = yield* splitPair([c, b])

          return yield* stage.observe({
            windows: [windowId],
            returned: () => stage.splitLabel(splitViewId),
          })
        }),
      expected: {
        tabEvents: ["updated b split=s1", "updated c split=s1"],
        returned: "s1",
        strip: ["a active", "b s1", "c s1", "d"],
      },
    }),
    withSplitView({
      name: "non-adjacent tabs cannot be split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, , c],
          } = yield* stage.openWindow(["a", "b", "c"])

          const outcome = yield* stage.attempt(splitPair([a, c]), stage.splitLabel)

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active", "b", "c"] },
    }),
    withSplitView({
      name: "a tab already in a split cannot be split with another tab",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([a, b])
          yield* stage.skipEvents

          const outcome = yield* stage.attempt(splitPair([b, c]), stage.splitLabel)

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a s1 active", "b s1", "c"] },
    }),
    withSplitView({
      name: "tabs with different pinned states cannot be split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          const outcome = yield* stage.attempt(splitPair([a, b]), stage.splitLabel)

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a pinned active", "b", "c"] },
    }),
    withSplitView({
      name: "tabs in different groups cannot be split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))
          yield* stage.skipEvents

          const outcome = yield* stage.attempt(splitPair([b, c]), stage.splitLabel)

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active", "b g1", "c"] },
    }),
    withSplitView({
      name: "two pinned tabs can be split",
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

          yield* splitPair([a, b])

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a pinned s1 active", "b pinned s1", "c"],
        tabEvents: ["updated a split=s1", "updated b split=s1"],
      },
    }),
    withSplitView({
      name: "unsplitting removes both tabs from the split, left first",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          const splitViewId = yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.unsplit(splitViewId))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "b", "c"],
        tabEvents: ["updated b split=none", "updated c split=none"],
      },
    }),
    withSplitView({
      name: "unsplitting a split that no longer exists fails",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          const splitViewId = yield* splitPair([b, c])
          yield* Tabs.use((tabs) => tabs.unsplit(splitViewId))
          yield* stage.skipEvents

          const outcome = yield* stage.attempt(
            Tabs.use((tabs) => tabs.unsplit(splitViewId)),
            () => "unsplit",
          )

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active", "b", "c"] },
    }),
    withSplitView({
      name: "splitWithTabId opens the tab right of its partner and splits the partner first",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: pageUrl("x"), active: false, splitWithTabId: a }),
          )
          stage.name(created.id, "x")

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(created) })
        }),
      expected: {
        tabEvents: ["created x@1", "updated a split=s1", "updated x split=s1"],
        returned: "x@1 s1",
        strip: ["a s1 active", "x s1", "b"],
      },
    }),
    withSplitView({
      name: "splitWithTabId with the partner's index opens the tab to the left of the partner",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b"])

          yield* Tabs.use((tabs) =>
            Effect.map(
              tabs.create({
                windowId,
                index: 1,
                url: pageUrl("x"),
                active: false,
                splitWithTabId: b,
              }),
              (created) => stage.name(created.id, "x"),
            ),
          )

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["created x@1", "updated x split=s1", "updated b split=s1"],
        strip: ["a active", "x s1", "b s1"],
      },
    }),
    withSplitView({
      name: "splitWithTabId with an index away from the partner fails without opening a tab",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, , c],
          } = yield* stage.openWindow(["a", "b", "c"])

          const outcome = yield* stage.attempt(
            Tabs.use((tabs) =>
              tabs.create({
                windowId,
                index: 0,
                url: pageUrl("x"),
                active: false,
                splitWithTabId: c,
              }),
            ),
            stage.tab,
          )

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active", "b", "c"] },
    }),
    withSplitView({
      name: "a tab split with a grouped partner joins the group before it is split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) =>
            Effect.map(
              tabs.create({ windowId, url: pageUrl("x"), active: false, splitWithTabId: b }),
              (created) => stage.name(created.id, "x"),
            ),
          )

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: [
          "created x@2",
          "updated x group=g1",
          "updated b split=s1",
          "updated x split=s1",
        ],
        strip: ["a active", "b g1 s1", "x g1 s1", "c"],
      },
    }),
    withSplitView({
      name: "a tab split with a pinned partner is pinned too",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) =>
            Effect.map(
              tabs.create({ windowId, url: pageUrl("x"), active: false, splitWithTabId: a }),
              (created) => stage.name(created.id, "x"),
            ),
          )

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["created x@1 pinned", "updated a split=s1", "updated x split=s1"],
        strip: ["a pinned s1 active", "x pinned s1", "b"],
      },
    }),
    withSplitView({
      name: "moving one tab of a split unsplits before moving",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([b], { index: "end" }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["updated b split=none", "updated c split=none"],
        moveEvents: ["b 1→3"],
        strip: ["a active", "c", "d", "b"],
      },
    }),
    withSplitView({
      name: "moving both tabs of a split together still unsplits them",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, , c, d],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([c, d])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([c, d], { index: 0 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["updated c split=none", "updated d split=none"],
        moveEvents: ["c 2→0", "d 3→1"],
        strip: ["c", "d", "a active", "b"],
      },
    }),
    withSplitView({
      name: "moving both tabs of a split to where they already are keeps the split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([b, c], { index: 1 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a active", "b s1", "c s1"] },
    }),
    withSplitView({
      name: "moving another tab between a split unsplits before moving",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([a], { index: 1 }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["updated b split=none", "updated c split=none"],
        moveEvents: ["a 0→1"],
        strip: ["b", "a active", "c", "d"],
      },
    }),
    withSplitView({
      name: "a tab opened at an index inside a split opens to its right and keeps the split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) =>
            Effect.map(
              tabs.create({ windowId, index: 2, url: pageUrl("x"), active: false }),
              (created) => stage.name(created.id, "x"),
            ),
          )

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["created x@3"],
        strip: ["a active", "b s1", "c s1", "x", "d"],
      },
    }),
    withSplitView({
      name: "pinning one tab of a split unsplits before pinning",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.update(c, { pinned: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["updated b split=none", "updated c split=none", "updated c pinned=true"],
        moveEvents: ["c 2→0"],
        strip: ["c pinned", "a active", "b"],
      },
    }),
    withSplitView({
      name: "closing one tab of a split unsplits before removing it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([b]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["updated b split=none", "updated c split=none", "removed b"],
        strip: ["a active", "c"],
      },
    }),
    withSplitView({
      name: "grouping one tab of a split groups its partner too and keeps the split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ["created g1", 'updated g1 title="" collapsed=false'],
        tabEvents: ["updated b group=g1", "updated c group=g1"],
        strip: ["a active", "b g1 s1", "c g1 s1", "d"],
      },
    }),
    withSplitView({
      name: "ungrouping one tab of a split ungroups its partner too and keeps the split",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])
          yield* splitPair([b, c])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.ungroup([c]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        groupEvents: ["removed g1"],
        tabEvents: ["updated b group=none", "updated c group=none"],
        strip: ["a active", "b s1", "c s1", "d"],
      },
    }),
    withSplitView({
      name: "duplicating one tab of a split unsplits, then opens the duplicate right after the original",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          const duplicated = yield* Tabs.use((tabs) => tabs.duplicate(b))
          stage.name(duplicated.id, "b2")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: [
          "updated b split=none",
          "updated c split=none",
          "created b2@2 active",
          "activated b2",
        ],
        strip: ["a", "b", "b2 active", "c"],
      },
    }),
    withSplitView({
      name: "discarding one tab of a split keeps the split with the tab's new ID",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.discard(c))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        tabEvents: ["replaced c→c'", "updated c' discarded=true"],
        strip: ["a active", "b s1", "c' s1 discarded"],
      },
    }),
    withSplitView({
      name: "moving one tab of a split to another window unsplits before moving",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId: first,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          const { windowId: second } = yield* stage.openWindow(["x"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.move([b], { windowId: second, index: "end" }))

          return yield* stage.observe({ windows: [first, second] })
        }),
      expected: {
        tabEvents: [
          "updated b split=none",
          "updated c split=none",
          "detached b w1@1",
          "attached b w2@1",
        ],
        strips: { w1: ["a active", "c"], w2: ["x active", "b"] },
      },
    }),
    withSplitView({
      name: "closing a window with a split unsplits first, then removes tabs from the right",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* splitPair([b, c])
          yield* stage.skipEvents

          yield* Windows.use((windows) => windows.remove(windowId))

          return yield* stage.events
        }),
      expected: {
        tabEvents: [
          "updated b split=none",
          "updated c split=none",
          "removed c windowClosing",
          "removed b windowClosing",
          "removed a windowClosing",
          "window removed w1",
        ],
      },
    }),
  ],
}
