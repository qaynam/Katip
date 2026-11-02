import { Effect, Option } from "effect"
import { Tabs, Windows } from "#platform/browser"
import type { ContractSuite } from "./scenario"
import { pageUrl, urlOf } from "./stage"

const DISCARD_SURVIVES = {
  chromeVersion: 156,
  reason: "149 の headless の Chrome は tabs.discard でブラウザごと落ちる（156 では落ちない）",
}

export const tabCreateSuite: ContractSuite = {
  name: "tabs.create",
  scenarios: [
    {
      name: "index を省略すると、ウィンドウの末尾に開く",
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
      name: "active を省略すると、開いたタブがアクティブになる",
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
      name: "作ったタブは、作った時点で開くページの URL を url か pendingUrl に持つ",
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
      name: "ピン留めの領域の中の index を指定しても、ピン留めしないタブは領域のすぐ後ろに開く",
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
      name: "ピン留めして開くと、ピン留めの領域の末尾に開く",
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
      name: "タブの数を超える index を指定すると、末尾に開く",
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
      name: "グループの途中に開くと、そのグループに入る",
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
      name: "グループの末尾のすぐ後ろに開いても、そのグループには入らない",
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
      name: "分割ビューの API が無い Chrome では、splitWithTabId を指定すると開かずに失敗する",
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
      name: "アクティブなタブを閉じると、右隣のタブがアクティブになる",
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
      name: "右端のアクティブなタブを閉じると、左隣のタブがアクティブになる",
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
      name: "opener を指定して開いたタブを閉じると、開いた元のタブがアクティブになる",
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
      name: "複数を閉じると、指定した順に閉じる",
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
      name: "存在しないタブを指定すると失敗し、それより前に指定したタブだけが閉じる",
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
      name: "ピン留めしたタブを閉じると、ピン留めを外してから閉じる",
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
      name: "グループのタブを閉じると、グループを抜けてから閉じる",
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
      name: "グループの最後のタブを閉じると、グループもなくなる",
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
      name: "ウィンドウの最後のタブを閉じると、ウィンドウを閉じるときの閉じ方ではなく閉じてから、ウィンドウも閉じる",
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
      name: "ウィンドウを閉じると、右のタブから順に閉じてからウィンドウを閉じる",
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
      name: "グループとピン留めのあるウィンドウを閉じると、先に右からグループとピン留めを解く",
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
  name: "tabs.update でのピン留め",
  scenarios: [
    {
      name: "ピン留めすると、ピン留めの領域の末尾へ動く",
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
      name: "ピン留めを外すと、ピン留めの領域のすぐ後ろへ動く",
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
      name: "グループのタブをピン留めすると、ピン留めしてからグループを抜ける",
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
      name: "ピン留め済みのタブをもう一度ピン留めしても、何も届かない",
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
  name: "tabs.update・duplicate・discard",
  scenarios: [
    {
      name: "アクティブにすると、アクティブになったことだけが届く",
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
      name: "既にアクティブなタブをアクティブにしても、何も届かない",
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
      name: "ミュートすると、ミュートの変化が届く",
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
      name: "複製すると、元のタブのすぐ右にアクティブなタブとして開き、opener はアクティブだったタブになる",
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
      name: "ピン留めしたタブを複製すると、複製もピン留めされる",
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
      name: "グループのタブを複製すると、複製もそのグループに入る",
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
      name: "アクティブでないタブを破棄すると、タブの ID が新しくなり、置き換わったことが届く",
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
