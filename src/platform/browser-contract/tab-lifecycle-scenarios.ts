import { Effect, Option } from "effect"
import { Tabs, Windows } from "#platform/browser"
import type { ContractSuite } from "./scenario"
import { pageUrl, urlOf } from "./stage"

const DISCARD_SURVIVES = {
  chromeVersion: 156,
  reason: "headless Chrome 149 crashes on tabs.discard (156 does not)",
}

export const tabCreateSuite: ContractSuite = {
  name: "tabs.create",
  scenarios: [
    {
      name: "without an index, the tab opens at the end of the window",
      run: (stage) =>
        Effect.gen(function* () {
          const { windowId } = yield* stage.openWindow(["a", "b"])

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: pageUrl("c"), active: false }),
          )
          stage.name(created.id, "c")

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(created) })
        }),
      expected: { returned: "c@2", strip: ["a active", "b", "c"], tabEvents: ["created c@2"] },
    },
    {
      name: "without active, the new tab becomes active",
      run: (stage) =>
        Effect.gen(function* () {
          const { windowId } = yield* stage.openWindow(["a", "b"])

          const created = yield* Tabs.use((tabs) => tabs.create({ windowId, url: pageUrl("c") }))
          stage.name(created.id, "c")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a", "b", "c active"],
        tabEvents: ["created c@2 active", "activated c"],
      },
    },
    {
      name: "a created tab already holds the URL it opens in url or pendingUrl",
      run: (stage) =>
        Effect.gen(function* () {
          const { windowId } = yield* stage.openWindow(["a"])

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: pageUrl("c"), active: false }),
          )

          return { url: urlOf(created) }
        }),
      expected: { url: pageUrl("c") },
    },
    {
      name: "an unpinned tab requested inside the pinned area opens right after it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, index: 0, url: pageUrl("c"), active: false }),
          )
          stage.name(created.id, "c")

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(created) })
        }),
      expected: {
        returned: "c@1",
        strip: ["a pinned active", "c", "b"],
        tabEvents: ["created c@1"],
      },
    },
    {
      name: "a pinned tab opens at the end of the pinned area",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: pageUrl("c"), active: false, pinned: true }),
          )
          stage.name(created.id, "c")

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(created) })
        }),
      expected: {
        returned: "c@1 pinned",
        strip: ["a pinned active", "c pinned", "b"],
        tabEvents: ["created c@1 pinned"],
      },
    },
    {
      name: "an index beyond the tab count opens the tab at the end",
      run: (stage) =>
        Effect.gen(function* () {
          const { windowId } = yield* stage.openWindow(["a", "b"])

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, index: 99, url: pageUrl("c"), active: false }),
          )
          stage.name(created.id, "c")

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(created) })
        }),
      expected: { returned: "c@2", strip: ["a active", "b", "c"], tabEvents: ["created c@2"] },
    },
    {
      name: "a tab opened inside a group joins that group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, index: 2, url: pageUrl("d"), active: false }),
          )
          stage.name(created.id, "d")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a active", "b g1", "d g1", "c g1"], tabEvents: ["created d@2 g1"] },
    },
    {
      name: "a tab opened right after the end of a group does not join it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [a, b], windowId }))
          yield* stage.skipEvents

          const created = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, index: 2, url: pageUrl("d"), active: false }),
          )
          stage.name(created.id, "d")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a g1 active", "b g1", "d", "c"], tabEvents: ["created d@2"] },
    },
    {
      name: "without the split view API, splitWithTabId fails without opening a tab",
      splitView: "unavailable",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a"])

          const outcome = yield* stage.attempt(
            Tabs.use((tabs) =>
              tabs.create({ windowId, url: pageUrl("b"), active: false, splitWithTabId: a }),
            ),
            stage.tab,
          )

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active"] },
    },
  ],
}

export const tabRemoveSuite: ContractSuite = {
  name: "tabs.remove",
  scenarios: [
    {
      name: "closing the active tab activates its right neighbor",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(b, { active: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([b]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a", "c active"], tabEvents: ["removed b", "activated c"] },
    },
    {
      name: "closing the active rightmost tab activates its left neighbor",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, , c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(c, { active: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([c]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a", "b active"], tabEvents: ["removed c", "activated b"] },
    },
    {
      name: "closing a tab opened with an opener activates the opener",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b", "c"])
          const child = yield* Tabs.use((tabs) =>
            tabs.create({ windowId, url: pageUrl("d"), openerTabId: a }),
          )
          stage.name(child.id, "d")
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([child.id]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a active", "b", "c"], tabEvents: ["removed d", "activated a"] },
    },
    {
      name: "closing several tabs closes them in the given order",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, , c],
          } = yield* stage.openWindow(["a", "b", "c"])

          yield* Tabs.use((tabs) => tabs.remove([c, a]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["b active"], tabEvents: ["removed c", "removed a", "activated b"] },
    },
    {
      name: "a missing tab fails the call, and only the tabs listed before it are closed",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c, gone],
          } = yield* stage.openWindow(["a", "b", "c", "gone"])
          yield* Tabs.use((tabs) => tabs.remove([gone]))
          yield* stage.skipEvents

          const outcome = yield* stage.attempt(
            Tabs.use((tabs) => tabs.remove([b, gone, c])),
            () => "closed",
          )

          return yield* stage.observe({ windows: [windowId], returned: () => outcome })
        }),
      expected: { returned: "failed", strip: ["a active", "c"], tabEvents: ["removed b"] },
    },
    {
      name: "closing a pinned tab unpins it before removing it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(b, { pinned: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([b]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "c"],
        tabEvents: ["updated b pinned=false", "removed b"],
      },
    },
    {
      name: "closing a grouped tab ungroups it before removing it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([b]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "c g1"],
        tabEvents: ["updated b group=none", "removed b"],
      },
    },
    {
      name: "closing the last tab of a group removes the group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.remove([b]))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a active", "c"],
        tabEvents: ["updated b group=none", "removed b"],
        groupEvents: ["removed g1"],
      },
    },
    {
      name: "closing the last tab of a window removes it as a normal close, then removes the window",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            tabs: [a],
          } = yield* stage.openWindow(["a"])

          yield* Tabs.use((tabs) => tabs.remove([a]))

          return yield* stage.events
        }),
      expected: { tabEvents: ["removed a", "window removed w1"] },
    },
  ],
}

export const windowCloseSuite: ContractSuite = {
  name: "windows.remove",
  scenarios: [
    {
      name: "closing a window removes its tabs from the right, then the window",
      run: (stage) =>
        Effect.gen(function* () {
          const { windowId } = yield* stage.openWindow(["a", "b", "c"])

          yield* Windows.use((windows) => windows.remove(windowId))

          return yield* stage.events
        }),
      expected: {
        tabEvents: [
          "removed c windowClosing",
          "removed b windowClosing",
          "removed a windowClosing",
          "window removed w1",
        ],
      },
    },
    {
      name: "closing a window first ungroups and unpins its tabs from the right",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a, b, , d, e],
          } = yield* stage.openWindow(["a", "b", "c", "d", "e"])
          yield* Tabs.use((tabs) =>
            Effect.all([
              tabs.update(a, { pinned: true }),
              tabs.update(b, { pinned: true }),
              tabs.group({ tabIds: [d, e], windowId }),
            ]),
          )
          yield* stage.skipEvents

          yield* Windows.use((windows) => windows.remove(windowId))

          return yield* stage.events
        }),
      expected: {
        tabEvents: [
          "updated e group=none",
          "updated d group=none",
          "updated b pinned=false",
          "updated a pinned=false",
          "removed e windowClosing",
          "removed d windowClosing",
          "removed c windowClosing",
          "removed b windowClosing",
          "removed a windowClosing",
          "window removed w1",
        ],
        groupEvents: ["removed g1"],
      },
    },
  ],
}

export const tabPinSuite: ContractSuite = {
  name: "pinning with tabs.update",
  scenarios: [
    {
      name: "pinning moves the tab to the end of the pinned area",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, , c],
          } = yield* stage.openWindow(["a", "b", "c"])

          const pinned = yield* Tabs.use((tabs) => tabs.update(c, { pinned: true }))

          return yield* stage.observe({ windows: [windowId], returned: () => stage.tab(pinned) })
        }),
      expected: {
        returned: "c@0 pinned",
        strip: ["c pinned", "a active", "b"],
        tabEvents: ["updated c pinned=true"],
        moveEvents: ["c 2→0"],
      },
    },
    {
      name: "unpinning moves the tab right after the pinned area",
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

          yield* Tabs.use((tabs) => tabs.update(a, { pinned: false }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["b pinned", "a active", "c"],
        tabEvents: ["updated a pinned=false"],
        moveEvents: ["a 0→1"],
      },
    },
    {
      name: "pinning a grouped tab pins it, then ungroups it",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.update(c, { pinned: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["c pinned", "a active", "b g1"],
        tabEvents: ["updated c pinned=true", "updated c group=none"],
        moveEvents: ["c 2→0"],
      },
    },
    {
      name: "pinning an already pinned tab emits nothing",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])
          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))
          yield* stage.skipEvents

          yield* Tabs.use((tabs) => tabs.update(a, { pinned: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a pinned active", "b"] },
    },
  ],
}

export const tabUpdateSuite: ContractSuite = {
  name: "tabs.update, duplicate and discard",
  scenarios: [
    {
      name: "activating a tab emits only the activation",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b"])

          yield* Tabs.use((tabs) => tabs.update(b, { active: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a", "b active"], tabEvents: ["activated b"] },
    },
    {
      name: "activating the already active tab emits nothing",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [a],
          } = yield* stage.openWindow(["a", "b"])

          yield* Tabs.use((tabs) => tabs.update(a, { active: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a active", "b"] },
    },
    {
      name: "muting emits the muted change",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b"])

          yield* Tabs.use((tabs) => tabs.update(b, { muted: true }))

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: { strip: ["a active", "b muted"], tabEvents: ["updated b muted=true"] },
    },
    {
      name: "duplicating opens an active tab right after the original, with the previously active tab as opener",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, , c],
          } = yield* stage.openWindow(["a", "b", "c", "d"])

          const duplicated = yield* Tabs.use((tabs) => tabs.duplicate(c))
          stage.name(duplicated.id, "c2")

          return yield* stage.observe({
            windows: [windowId],
            returned: () => ({
              tab: stage.tab(duplicated),
              opener: Option.getOrNull(Option.map(duplicated.openerTabId, stage.tabLabel)),
              url: urlOf(duplicated),
            }),
          })
        }),
      expected: {
        returned: { tab: "c2@3 active", opener: "a", url: pageUrl("c") },
        strip: ["a", "b", "c", "c2 active", "d"],
        tabEvents: ["created c2@3 active", "activated c2"],
      },
    },
    {
      name: "duplicating a pinned tab pins the duplicate too",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.update(b, { pinned: true }))
          yield* stage.skipEvents

          const duplicated = yield* Tabs.use((tabs) => tabs.duplicate(b))
          stage.name(duplicated.id, "b2")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["b pinned", "b2 pinned active", "a", "c"],
        tabEvents: ["created b2@1 pinned active", "activated b2"],
      },
    },
    {
      name: "duplicating a grouped tab puts the duplicate in the same group",
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b, c],
          } = yield* stage.openWindow(["a", "b", "c"])
          yield* Tabs.use((tabs) => tabs.group({ tabIds: [b, c], windowId }))
          yield* stage.skipEvents

          const duplicated = yield* Tabs.use((tabs) => tabs.duplicate(b))
          stage.name(duplicated.id, "b2")

          return yield* stage.observe({ windows: [windowId] })
        }),
      expected: {
        strip: ["a", "b g1", "b2 g1 active", "c g1"],
        tabEvents: ["created b2@2 g1 active", "activated b2"],
      },
    },
    {
      name: "discarding an inactive tab gives it a new ID and emits the replacement",
      skipBefore: DISCARD_SURVIVES,
      run: (stage) =>
        Effect.gen(function* () {
          const {
            windowId,
            tabs: [, b],
          } = yield* stage.openWindow(["a", "b", "c"])

          const discarded = yield* Tabs.use((tabs) => tabs.discard(b))

          return yield* stage.observe({
            windows: [windowId],
            returned: () => stage.tab(discarded),
          })
        }),
      expected: {
        returned: "b'@1 discarded",
        strip: ["a active", "b' discarded", "c"],
        tabEvents: ["replaced b→b'", "updated b' discarded=true"],
      },
    },
  ],
}
