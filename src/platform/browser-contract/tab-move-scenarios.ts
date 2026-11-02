import { Effect } from "effect"
import { Tabs } from "#platform/browser"
import type { ContractSuite } from "./scenario"

export const tabMoveSuite: ContractSuite = {
  name: "tabs.move",
  scenarios: [
    {
      name: "1 つだけ動かしても、動かしたタブを 1 つ入れた配列を返す",
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
      name: "複数を動かすと、前のタブを置いた位置の次に後のタブを置く",
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
      name: "末尾を指定して複数を動かすと、指定した順に末尾へ並び、それぞれを動かした時点の位置を返す",
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
      name: "タブの数を超える位置を指定すると、末尾へ動く",
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
      name: "ピン留めしていないタブをピン留めの領域へ動かそうとすると、領域のすぐ後ろで止まる",
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
      name: "ピン留めしたタブをピン留めの領域の外へ動かそうとすると、領域の末尾で止まる",
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
      name: "ピン留めしたタブとしていないタブを一緒に動かすと、それぞれ自分の領域の中に置かれる",
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
      name: "グループの途中へ動かすと、そのグループに入る",
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
      name: "グループの外へ動かすと、グループを抜ける",
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
      name: "グループに属さないタブとグループの境目へ動かしても、グループには入らない",
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
      name: "別のウィンドウへ動かすと、元のウィンドウから外れて、移った先に付く",
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
      name: "ピン留めしたタブを別のウィンドウへ動かすと、ピン留めを外してから移す",
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
      name: "グループのタブを別のウィンドウへ動かすと、グループを抜けてから移す",
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
