import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { TestClock } from "effect/testing"
import {
  type BrowserEvent,
  SplitViewId,
  TabGroupId,
  TabGroups,
  TabId,
  Tabs,
  type WindowId,
} from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

const splitViewChangesOf = (events: ReadonlyArray<BrowserEvent>) =>
  events.flatMap((event) =>
    event._tag === "TabUpdated" && event.changes.splitViewId !== undefined
      ? [[event.tabId, event.changes.splitViewId] as const]
      : [],
  )

const splitViewOf = (tabId: TabId) =>
  Tabs.use((tabs) => tabs.get(tabId)).pipe(Effect.map(({ splitViewId }) => splitViewId))

const tabOrderIn = (windowId: WindowId) =>
  Tabs.use((tabs) => tabs.query({ windowId })).pipe(
    Effect.map((found) => found.map(({ id }) => id)),
  )

const missingTab = TabId.make(9999)
const missingGroup = TabGroupId.make(9999)
const missingSplitView = SplitViewId.make(9999)

layer(FakeBrowser.layer, { buildPerTest: true })("Tabs の fake", (it) => {
  describe("タブを閉じたとき", () => {
    it.effect("右にあったタブの index が 1 つずつ詰まる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, closing, right],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        yield* tabs.remove([closing])

        assert.strictEqual((yield* tabs.get(right)).index, 1)
      }),
    )

    it.effect("存在しない ID に当たると失敗し、それより前に指定したタブは閉じたままになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [first, second, third],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        const error = yield* Effect.flip(tabs.remove([second, missingTab, third]))

        assert.strictEqual(error._tag, "BrowserApiError")
        assert.deepStrictEqual(yield* tabOrderIn(windowId), [first, third])
      }),
    )

    it.effect("閉じたタブを opener にしていたタブは、閉じたタブの opener を引き継ぐ", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [grandparent, parent, child],
        } = yield* fake.seedWindow({ tabs: [{}, { openerIndex: 0 }, { openerIndex: 1 }] })

        yield* tabs.remove([parent])

        assert.deepStrictEqual((yield* tabs.get(child)).openerTabId, Option.some(grandparent))
      }),
    )

    it.effect(
      "for the last tab of a group, the tab leaves the group and the group is removed before TabRemoved",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          const {
            tabIds: [, grouped],
          } = yield* fake.seedWindow({ tabs: [{}, { group: "work" }], groups: { work: {} } })

          yield* tabs.remove([grouped])

          assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
            "TabUpdated",
            "TabGroupRemoved",
            "TabRemoved",
          ])
        }),
    )

    it.effect(
      "ウィンドウの最後のタブならウィンドウも閉じ、直前にフォーカスしていたウィンドウへフォーカスが移る",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          const earlier = yield* fake.seedWindow({ tabs: [{}] })
          const focused = yield* fake.seedWindow({ tabs: [{}], focused: true })

          yield* tabs.remove([focused.tabIds[0]])

          assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
            {
              _tag: "TabRemoved",
              tabId: focused.tabIds[0],
              windowId: focused.windowId,
              isWindowClosing: false,
            },
            { _tag: "WindowRemoved", windowId: focused.windowId },
            { _tag: "WindowFocusChanged", windowId: Option.some(earlier.windowId) },
          ])
        }),
    )
  })

  describe("アクティブなタブを閉じたとき", () => {
    it.effect("TabRemoved の後に、右隣のタブの TabActivated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [, closing, right],
        } = yield* fake.seedWindow({ tabs: [{}, { active: true }, {}] })

        yield* tabs.remove([closing])

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabRemoved", tabId: closing, windowId, isWindowClosing: false },
          { _tag: "TabActivated", tabId: right, windowId },
        ])
      }),
    )

    it.effect("右端のタブなら左隣のタブがアクティブになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, closing],
        } = yield* fake.seedWindow({ tabs: [{}, { active: true }] })

        yield* tabs.remove([closing])

        assert.isTrue((yield* tabs.get(left)).active)
      }),
    )

    it.effect("そのタブから開いたタブが、右隣のタブより先にアクティブになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [closing, , child],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, {}, { openerIndex: 0 }] })

        yield* tabs.remove([closing])

        assert.isTrue((yield* tabs.get(child)).active)
      }),
    )

    it.effect("同じグループの隣のタブが、グループの外の隣のタブより先にアクティブになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [sameGroup, closing],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work", active: true }, {}],
          groups: { work: {} },
        })

        yield* tabs.remove([closing])

        assert.isTrue((yield* tabs.get(sameGroup)).active)
      }),
    )

    it.effect("折りたたまれたグループのタブは飛ばされる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [closing, , beyondGroup],
        } = yield* fake.seedWindow({
          tabs: [{ active: true }, { group: "work" }, {}],
          groups: { work: { collapsed: true } },
        })

        yield* tabs.remove([closing])

        assert.isTrue((yield* tabs.get(beyondGroup)).active)
      }),
    )
  })

  describe("タブを開いたとき", () => {
    it.effect("index を省略すると末尾に開き、TabCreated の後に TabActivated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}, {}] })

        const created = yield* tabs.create({ url: "https://example.com/" })

        assert.deepStrictEqual([created.index, created.active], [2, true])
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabCreated",
          "TabActivated",
        ])
      }),
    )

    it.effect("active: false で開くと、アクティブなタブは変わらない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [active],
        } = yield* fake.seedWindow({ tabs: [{ active: true }] })

        yield* tabs.create({ active: false })

        assert.isTrue((yield* tabs.get(active)).active)
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), ["TabCreated"])
      }),
    )

    it.effect("ウィンドウを指定しなければ、フォーカス中のウィンドウに開く", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const focused = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedWindow({ tabs: [{}], focused: false })

        const created = yield* tabs.create({})

        assert.strictEqual(created.windowId, focused.windowId)
      }),
    )

    it.effect("ピン留めして開いたタブは、ピン留めの領域の末尾に入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{ pinned: true }, {}, {}] })

        const created = yield* tabs.create({ pinned: true })

        assert.strictEqual(created.index, 1)
      }),
    )

    it.effect("ピン留めしないタブは、ピン留めの領域を指定しても領域の後ろに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{ pinned: true }, { pinned: true }, {}] })

        const created = yield* tabs.create({ index: 0 })

        assert.strictEqual(created.index, 2)
      }),
    )

    it.effect("両隣が同じグループの位置に開いたタブは、そのグループに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, {}],
          groups: { work: {} },
        })

        const created = yield* tabs.create({ index: 1 })

        assert.deepStrictEqual(created.groupId, Option.some(groupIds.work))
      }),
    )

    it.effect("グループの直後に開いたタブは、グループに入らない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, {}],
          groups: { work: {} },
        })

        const created = yield* tabs.create({ index: 2 })

        assert.deepStrictEqual(created.groupId, Option.none())
      }),
    )

    it.effect("別のウィンドウのタブを opener にすると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const here = yield* fake.seedWindow({ tabs: [{}] })
        const elsewhere = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(
          tabs.create({ windowId: here.windowId, openerTabId: elsewhere.tabIds[0] }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("同じウィンドウの中でタブを動かしたとき", () => {
    it.effect("TabMoved が発火し、間にあったタブが詰まる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [a, b, c, d],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}, {}] })

        yield* tabs.move([a], { index: 2 })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabMoved", tabId: a, windowId, fromIndex: 0, toIndex: 2 },
        ])
        assert.deepStrictEqual(yield* tabOrderIn(windowId), [b, c, a, d])
      }),
    )

    it.effect("end を指定すると末尾へ動く", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [a, b, c],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        yield* tabs.move([a], { index: "end" })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [b, c, a])
      }),
    )

    it.effect("複数のタブを動かすと、index から指定した順に並ぶ", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [a, b, c, d],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}, {}] })

        yield* tabs.move([c, d], { index: 0 })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [c, d, a, b])
      }),
    )

    it.effect("ピン留めしていないタブは、ピン留めの領域へは入らず境界に寄せられる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, , , moving],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, { pinned: true }, {}, {}] })

        const [moved] = yield* tabs.move([moving], { index: 0 })

        assert.strictEqual(moved?.index, 2)
      }),
    )

    it.effect("グループの途中へ動かしたタブは、TabMoved の後にグループへ入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [moving],
          groupIds,
        } = yield* fake.seedWindow({
          tabs: [{}, { group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        const [moved] = yield* tabs.move([moving], { index: 1 })

        assert.deepStrictEqual(moved?.groupId, Option.some(groupIds.work))
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), ["TabMoved", "TabUpdated"])
      }),
    )

    it.effect("グループの外へ動かしたタブはグループを抜ける", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [moving],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, {}, {}],
          groups: { work: {} },
        })

        const [moved] = yield* tabs.move([moving], { index: 3 })

        assert.deepStrictEqual(moved?.groupId, Option.none())
      }),
    )

    it.effect("グループのただ 1 つのタブは、動かしてもグループに残る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [moving],
          groupIds,
        } = yield* fake.seedWindow({ tabs: [{ group: "solo" }, {}, {}], groups: { solo: {} } })

        const [moved] = yield* tabs.move([moving], { index: 2 })

        assert.deepStrictEqual(moved?.groupId, Option.some(groupIds.solo))
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), ["TabMoved"])
      }),
    )
  })

  describe("別のウィンドウへタブを動かしたとき", () => {
    it.effect("TabDetached、元のウィンドウの TabActivated、TabAttached の順に発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const source = yield* fake.seedWindow({ tabs: [{ active: true }, {}] })
        const target = yield* fake.seedWindow({ tabs: [{}] })
        const [moving, remaining] = source.tabIds

        yield* tabs.move([moving], { index: 0, windowId: target.windowId })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabDetached", tabId: moving, oldWindowId: source.windowId, oldPosition: 0 },
          { _tag: "TabActivated", tabId: remaining, windowId: source.windowId },
          { _tag: "TabAttached", tabId: moving, newWindowId: target.windowId, newPosition: 0 },
        ])
      }),
    )

    it.effect("移った先のウィンドウではアクティブにならない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const source = yield* fake.seedWindow({ tabs: [{ active: true }, {}] })
        const target = yield* fake.seedWindow({ tabs: [{}] })

        const [moved] = yield* tabs.move([source.tabIds[0]], {
          index: "end",
          windowId: target.windowId,
        })

        assert.deepStrictEqual([moved?.windowId, moved?.active], [target.windowId, false])
      }),
    )

    it.effect("元のウィンドウの最後のタブなら、元のウィンドウが閉じる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const source = yield* fake.seedWindow({ tabs: [{}] })
        const target = yield* fake.seedWindow({ tabs: [{}] })

        yield* tabs.move([source.tabIds[0]], { index: 0, windowId: target.windowId })

        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabDetached",
          "TabAttached",
          "WindowRemoved",
          "WindowFocusChanged",
        ])
      }),
    )

    it.effect("グループに属していたタブはグループを抜ける", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const source = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }],
          groups: { work: {} },
        })
        const target = yield* fake.seedWindow({ tabs: [{}] })

        const [moved] = yield* tabs.move([source.tabIds[0]], {
          index: 0,
          windowId: target.windowId,
        })

        assert.deepStrictEqual(moved?.groupId, Option.none())
      }),
    )
  })

  describe("タブを更新したとき", () => {
    it.effect("アクティブにすると TabActivated が発火し、lastAccessed がその時刻になる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [, other],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, {}] })
        yield* TestClock.adjust(5000)

        const updated = yield* tabs.update(other, { active: true })

        assert.deepStrictEqual(updated.lastAccessed, Option.some(5000))
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabActivated", tabId: other, windowId },
        ])
      }),
    )

    it.effect("既にアクティブなタブをアクティブにしても、イベントは発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [active],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, {}] })

        yield* tabs.update(active, { active: true })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect(
      "折りたたまれたグループのタブをアクティブにすると、グループが展開されてからアクティブになる",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          const groups = yield* TabGroups
          const {
            tabIds: [, hidden],
            groupIds,
          } = yield* fake.seedWindow({
            tabs: [{ active: true }, { group: "work" }],
            groups: { work: { collapsed: true } },
          })

          yield* tabs.update(hidden, { active: true })

          assert.isFalse((yield* groups.get(groupIds.work)).collapsed)
          assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
            "TabGroupUpdated",
            "TabActivated",
          ])
        }),
    )

    it.effect(
      "pinning emits the pinned change, then moves the tab to the end of the pinned area",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          const {
            windowId,
            tabIds: [, , pinning],
          } = yield* fake.seedWindow({ tabs: [{ pinned: true }, {}, {}] })

          const updated = yield* tabs.update(pinning, { pinned: true })

          assert.strictEqual(updated.index, 1)
          assert.deepStrictEqual(
            (yield* fake.takeEmittedEvents).map((event) =>
              event._tag === "TabUpdated" ? event.changes : event,
            ),
            [
              { pinned: true },
              { _tag: "TabMoved", tabId: pinning, windowId, fromIndex: 2, toIndex: 1 },
            ],
          )
        }),
    )

    it.effect("pinning a grouped tab pins it, ungroups it, then moves it", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, pinning],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        const updated = yield* tabs.update(pinning, { pinned: true })

        assert.deepStrictEqual([updated.groupId, updated.index], [Option.none(), 0])
        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event._tag,
          ),
          [{ pinned: true }, { groupId: Option.none() }, "TabMoved"],
        )
      }),
    )

    it.effect("ピン留めを外すと、ピン留めでない領域の先頭へ動く", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [unpinning],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, { pinned: true }, {}] })

        const updated = yield* tabs.update(unpinning, { pinned: false })

        assert.deepStrictEqual([updated.index, updated.pinned], [1, false])
      }),
    )

    it.effect("URL を変えると、url の変化を持つ TabUpdated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{ url: "https://before.example/" }] })

        yield* tabs.update(tab, { url: "https://after.example/" })

        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event,
          ),
          [{ url: "https://after.example/" }],
        )
      }),
    )

    it.effect("ミュートすると、muted の変化を持つ TabUpdated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{}] })

        const updated = yield* tabs.update(tab, { muted: true })

        assert.isTrue(updated.muted)
        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event,
          ),
          [{ muted: true }],
        )
      }),
    )

    it.effect("存在しないタブは失敗する", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs

        const error = yield* Effect.flip(tabs.update(missingTab, { active: true }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("タブをグループにまとめたとき", () => {
    it.effect(
      "emits the group creation and an appearance update, and the grouped tabs' changes in tab strip order",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          const {
            tabIds: [first, , third],
          } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

          yield* tabs.group({ tabIds: [third, first] })

          const events = yield* fake.takeEmittedEvents
          assert.deepStrictEqual(
            tagsOf(events).filter((tag) => tag.startsWith("TabGroup")),
            ["TabGroupCreated", "TabGroupUpdated"],
          )
          assert.deepStrictEqual(
            events.flatMap((event) => (event._tag === "TabUpdated" ? [event.tabId] : [])),
            [first, third],
          )
        }),
    )

    it.effect("離れたタブは、先頭のタブの直後に寄せて並ぶ", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [first, second, third],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        yield* tabs.group({ tabIds: [first, third] })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [first, third, second])
      }),
    )

    it.effect("既存のグループに加えたタブは、グループの末尾に並ぶ", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [g1, g2, other, joining],
          groupIds,
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, {}, {}],
          groups: { work: {} },
        })

        yield* tabs.group({ tabIds: [joining], groupId: groupIds.work })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [g1, g2, joining, other])
        assert.deepStrictEqual((yield* tabs.get(joining)).groupId, Option.some(groupIds.work))
      }),
    )

    it.effect("ピン留めしたタブは、ピン留めが外れてからグループに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [pinned],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, {}] })

        const groupId = yield* tabs.group({ tabIds: [pinned] })

        const tab = yield* tabs.get(pinned)
        assert.deepStrictEqual([tab.pinned, tab.groupId], [false, Option.some(groupId)])
      }),
    )

    it.effect("新しいグループの色は、そのウィンドウでまだ使われていない色になる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const groups = yield* TabGroups
        const {
          tabIds: [, ungrouped],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, {}],
          groups: { work: { color: "grey" } },
        })

        const groupId = yield* tabs.group({ tabIds: [ungrouped] })

        assert.strictEqual((yield* groups.get(groupId)).color, "blue")
      }),
    )

    it.effect("別のウィンドウのタブは、グループのあるウィンドウへ移ってからグループに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const home = yield* fake.seedWindow({ tabs: [{ group: "work" }], groups: { work: {} } })
        const away = yield* fake.seedWindow({ tabs: [{}, {}] })
        const joining = away.tabIds[1]

        yield* tabs.group({ tabIds: [joining], groupId: home.groupIds.work })

        const tab = yield* tabs.get(joining)
        assert.deepStrictEqual(
          [tab.windowId, tab.groupId],
          [home.windowId, Option.some(home.groupIds.work)],
        )
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabDetached",
          "TabAttached",
          "TabUpdated",
        ])
      }),
    )

    it.effect("存在しないグループを指定すると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.group({ tabIds: [tab], groupId: missingGroup }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("タブをグループから外したとき", () => {
    it.effect("グループの左半分のタブは、グループの左へ出る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [a, b, c, d],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, { group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        yield* tabs.ungroup([b])

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [b, a, c, d])
        assert.deepStrictEqual((yield* tabs.get(b)).groupId, Option.none())
      }),
    )

    it.effect("グループの右半分のタブは、グループの右へ出る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [a, b, c, d],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, { group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        yield* tabs.ungroup([c])

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [a, b, d, c])
      }),
    )

    it.effect("すべてのタブを外すとグループが消える", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const groups = yield* TabGroups
        const { tabIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        yield* tabs.ungroup(tabIds)

        assert.deepStrictEqual(yield* groups.query({}), [])
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabUpdated",
          "TabUpdated",
          "TabGroupRemoved",
        ])
      }),
    )
  })

  describe("タブを複製したとき", () => {
    it.effect("元のタブの右隣に、同じページの新しいタブが開いてアクティブになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [original, other],
        } = yield* fake.seedWindow({
          tabs: [{ url: "https://a.example/", title: "A", active: true }, {}],
        })

        const duplicated = yield* tabs.duplicate(original)

        assert.deepStrictEqual(
          [
            yield* tabOrderIn(windowId),
            duplicated.url,
            duplicated.title,
            duplicated.active,
            duplicated.openerTabId,
          ],
          [
            [original, duplicated.id, other],
            Option.some("https://a.example/"),
            Option.some("A"),
            true,
            Option.some(original),
          ],
        )
      }),
    )

    it.effect("無いタブは複製できない", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip((yield* Tabs).duplicate(missingTab))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("タブを破棄したとき", () => {
    it.effect("アクティブなタブは破棄できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [active],
        } = yield* fake.seedWindow({ tabs: [{ active: true }] })

        const error = yield* Effect.flip(tabs.discard(active))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("replaces the tab with one under a new ID, then emits the discarded change", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, background],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, {}] })

        const discarded = yield* tabs.discard(background)

        assert.isTrue(discarded.discarded)
        assert.notStrictEqual(discarded.id, background)
        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event,
          ),
          [
            { _tag: "TabReplaced", addedTabId: discarded.id, removedTabId: background },
            { discarded: true, status: "unloaded" },
          ],
        )
      }),
    )

    it.effect("tabs opened by the replaced tab take the replacement as their opener", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, opener, child],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, {}, { openerIndex: 1 }] })

        const discarded = yield* tabs.discard(opener)

        assert.deepStrictEqual((yield* tabs.get(child)).openerTabId, Option.some(discarded.id))
      }),
    )

    it.effect("破棄したタブをアクティブにすると、アクティブになってから読み込み直される", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, discarded],
        } = yield* fake.seedWindow({ tabs: [{ active: true }, { discarded: true }] })

        const updated = yield* tabs.update(discarded, { active: true })

        assert.isFalse(updated.discarded)
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabActivated",
          "TabUpdated",
        ])
      }),
    )
  })

  describe("タブを探したとき", () => {
    it.effect("groupId に None を指定すると、どのグループにも属さないタブだけを返す", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, ungrouped],
        } = yield* fake.seedWindow({ tabs: [{ group: "work" }, {}], groups: { work: {} } })

        const found = yield* tabs.query({ groupId: Option.none() })

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [ungrouped],
        )
      }),
    )

    it.effect("lastFocusedWindow を指定すると、フォーカス中のウィンドウのタブだけを返す", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}] })
        const focused = yield* fake.seedWindow({ tabs: [{}], focused: true })

        const found = yield* tabs.query({ lastFocusedWindow: true })

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [focused.tabIds[0]],
        )
      }),
    )
  })

  describe("2 つのタブを分割ビューにしたとき", () => {
    it.effect("両方のタブが返された分割ビューに入り、変化がタブストリップの順に発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const splitViewId = yield* tabs.createSplit([right, left])

        assert.deepStrictEqual(splitViewChangesOf(yield* fake.takeEmittedEvents), [
          [left, Option.some(splitViewId)],
          [right, Option.some(splitViewId)],
        ])
      }),
    )

    it.effect("ピン留めしたタブどうしは分割できる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, { pinned: true }] })

        const splitViewId = yield* tabs.createSplit([left, right])

        assert.deepStrictEqual(yield* splitViewOf(right), Option.some(splitViewId))
      }),
    )

    it.effect("同じグループのタブどうしは分割できる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        const splitViewId = yield* tabs.createSplit([left, right])

        assert.deepStrictEqual(yield* splitViewOf(right), Option.some(splitViewId))
      }),
    )

    it.effect("隣り合っていないタブは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, , right],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        const error = yield* Effect.flip(tabs.createSplit([left, right]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("同じタブどうしは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const error = yield* Effect.flip(tabs.createSplit([tab, tab]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("別のウィンドウのタブとは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const here = yield* fake.seedWindow({ tabs: [{}] })
        const elsewhere = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.createSplit([here.tabIds[0], elsewhere.tabIds[0]]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("既に分割ビューに入っているタブは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [, split, unsplit],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, {}] })

        const error = yield* Effect.flip(tabs.createSplit([split, unsplit]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("ピン留めが揃っていないタブは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [pinned, unpinned],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, {}] })

        const error = yield* Effect.flip(tabs.createSplit([pinned, unpinned]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("グループが揃っていないタブは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [grouped, ungrouped],
        } = yield* fake.seedWindow({ tabs: [{ group: "work" }, {}], groups: { work: {} } })

        const error = yield* Effect.flip(tabs.createSplit([grouped, ungrouped]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("分割ビューを解いたとき", () => {
    it.effect("両方のタブが分割ビューから外れ、変化がタブストリップの順に発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
          splitViewIds,
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        yield* tabs.unsplit(splitViewIds.a)

        assert.deepStrictEqual(splitViewChangesOf(yield* fake.takeEmittedEvents), [
          [left, Option.none()],
          [right, Option.none()],
        ])
      }),
    )

    it.effect("存在しない分割ビューは解けない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.unsplit(missingSplitView))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("分割ビューのタブを閉じたとき", () => {
    it.effect("both tabs, including the closing one, leave the split view before TabRemoved", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [closing, remaining],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, { active: true }] })

        yield* tabs.remove([closing])

        const emitted = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(tagsOf(emitted), ["TabUpdated", "TabUpdated", "TabRemoved"])
        assert.deepStrictEqual(splitViewChangesOf(emitted), [
          [closing, Option.none()],
          [remaining, Option.none()],
        ])
      }),
    )

    it.effect("closing the window takes both tabs out of the split view before removing them", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          windowId,
          tabIds: [left, right],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        yield* fake.closeWindow(windowId)

        const emitted = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(splitViewChangesOf(emitted), [
          [left, Option.none()],
          [right, Option.none()],
        ])
        assert.deepStrictEqual(tagsOf(emitted).slice(0, 3), [
          "TabUpdated",
          "TabUpdated",
          "TabRemoved",
        ])
      }),
    )
  })

  describe("分割ビューのタブを動かしたとき", () => {
    it.effect("片方だけを動かすと、両方が分割ビューから外れる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [moving, left],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, {}] })

        yield* tabs.move([moving], { index: "end" })

        assert.deepStrictEqual(
          [yield* splitViewOf(moving), yield* splitViewOf(left)],
          [Option.none(), Option.none()],
        )
      }),
    )

    it.effect("moving both together still takes both out of the split view", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [left, right, other],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, {}] })

        yield* tabs.move([left, right], { index: "end" })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [other, left, right])
        assert.deepStrictEqual(
          [yield* splitViewOf(left), yield* splitViewOf(right)],
          [Option.none(), Option.none()],
        )
      }),
    )

    it.effect("moving both to where they already are keeps the split view", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
          splitViewIds,
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, {}] })

        yield* tabs.move([left, right], { index: 0 })

        assert.deepStrictEqual(
          [yield* splitViewOf(left), yield* splitViewOf(right)],
          [Option.some(splitViewIds.a), Option.some(splitViewIds.a)],
        )
      }),
    )

    it.effect("両方を動かしても、間に別のタブを挟んで並べると分割ビューから外れる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right, other],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, {}] })

        yield* tabs.move([left, other, right], { index: 0 })

        assert.deepStrictEqual(
          [yield* splitViewOf(left), yield* splitViewOf(right)],
          [Option.none(), Option.none()],
        )
      }),
    )

    it.effect("片方だけを別のウィンドウへ動かすと、両方が分割ビューから外れる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [moving, left],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })
        const other = yield* fake.seedWindow({ tabs: [{}] })

        yield* tabs.move([moving], { index: "end", windowId: other.windowId })

        assert.deepStrictEqual(
          [yield* splitViewOf(moving), yield* splitViewOf(left)],
          [Option.none(), Option.none()],
        )
      }),
    )
  })

  describe("分割ビューのタブのピン留めやグループを変えたとき", () => {
    it.effect("片方をピン留めすると、両方が分割ビューから外れる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [pinning, other],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        yield* tabs.update(pinning, { pinned: true })

        assert.deepStrictEqual(
          [yield* splitViewOf(pinning), yield* splitViewOf(other)],
          [Option.none(), Option.none()],
        )
      }),
    )

    it.effect("grouping one puts the other in the same group and keeps the split view", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [grouping, other],
          splitViewIds,
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        const groupId = yield* tabs.group({ tabIds: [grouping] })

        assert.deepStrictEqual(
          [
            (yield* tabs.get(other)).groupId,
            yield* splitViewOf(grouping),
            yield* splitViewOf(other),
          ],
          [Option.some(groupId), Option.some(splitViewIds.a), Option.some(splitViewIds.a)],
        )
      }),
    )

    it.effect("ungrouping one ungroups the other too and keeps the split view", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [left, right],
          splitViewIds,
        } = yield* fake.seedWindow({
          tabs: [{ split: "a", group: "work" }, { split: "a", group: "work" }, {}],
          groups: { work: {} },
        })

        yield* tabs.ungroup([right])

        assert.deepStrictEqual(
          [(yield* tabs.get(left)).groupId, yield* splitViewOf(left), yield* splitViewOf(right)],
          [Option.none(), Option.some(splitViewIds.a), Option.some(splitViewIds.a)],
        )
      }),
    )
  })

  describe("既存のタブと分割ビューにしてタブを開いたとき", () => {
    it.effect("右隣に開き、TabCreated の後に両方が分割ビューに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [partner, other],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const created = yield* tabs.create({ splitWithTabId: partner })

        const emitted = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(yield* tabOrderIn(windowId), [partner, created.id, other])
        assert.deepStrictEqual(tagsOf(emitted), [
          "TabCreated",
          "TabActivated",
          "TabUpdated",
          "TabUpdated",
        ])
        assert.deepStrictEqual(splitViewChangesOf(emitted), [
          [partner, created.splitViewId],
          [created.id, created.splitViewId],
        ])
      }),
    )

    it.effect("そのタブの位置を index に指定すると左隣に開く", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [other, partner],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const created = yield* tabs.create({ splitWithTabId: partner, index: 1 })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [other, created.id, partner])
      }),
    )

    it.effect("隣にならない index を指定すると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [partner],
        } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        const error = yield* Effect.flip(tabs.create({ splitWithTabId: partner, index: 2 }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("別のウィンドウを指定すると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const here = yield* fake.seedWindow({ tabs: [{}] })
        const elsewhere = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(
          tabs.create({ splitWithTabId: here.tabIds[0], windowId: elsewhere.windowId }),
        )

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("既に分割ビューに入っているタブとは分割できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [split],
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        const error = yield* Effect.flip(tabs.create({ splitWithTabId: split }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("そのタブと食い違うピン留めを指定すると失敗する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [partner],
        } = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.create({ splitWithTabId: partner, pinned: true }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("開いたタブは、そのタブと同じグループに入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [partner],
          groupIds,
        } = yield* fake.seedWindow({ tabs: [{ group: "work" }, {}], groups: { work: {} } })

        const created = yield* tabs.create({ splitWithTabId: partner })

        assert.deepStrictEqual(created.groupId, Option.some(groupIds.work))
      }),
    )

    it.effect("ピン留めしたタブと分割すると、開いたタブもピン留めされる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          tabIds: [partner],
        } = yield* fake.seedWindow({ tabs: [{ pinned: true }, {}] })

        const created = yield* tabs.create({ splitWithTabId: partner })

        assert.deepStrictEqual([created.pinned, created.index], [true, 1])
      }),
    )
  })
})

layer(FakeBrowser.layerWith({ supportsSplitView: false }), { buildPerTest: true })(
  "分割ビューの API が無い Chrome の Tabs の fake",
  (it) => {
    it.effect("分割ビューの API が無いと答える", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs

        assert.isFalse(tabs.supportsSplitView)
      }),
    )

    it.effect("ユーザーが作った分割ビューは読める", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [left],
          splitViewIds,
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        assert.deepStrictEqual(yield* splitViewOf(left), Option.some(splitViewIds.a))
      }),
    )

    it.effect("分割ビューを作れない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const { tabIds } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const error = yield* Effect.flip(tabs.createSplit(tabIds))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("分割ビューを解けない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const { splitViewIds } = yield* fake.seedWindow({
          tabs: [{ split: "a" }, { split: "a" }],
        })

        const error = yield* Effect.flip(tabs.unsplit(splitViewIds.a))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("既存のタブと分割ビューにしてタブを開けない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const {
          windowId,
          tabIds: [partner],
        } = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.create({ splitWithTabId: partner }))

        assert.strictEqual(error._tag, "BrowserApiError")
        assert.deepStrictEqual(yield* tabOrderIn(windowId), [partner])
      }),
    )
  },
)
