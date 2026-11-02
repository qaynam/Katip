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

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Tabs", (it) => {
  describe("closing a tab", () => {
    it.effect("shifts the tabs to its right left by one index", () =>
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

    it.effect("fails at a missing ID, leaving the tabs listed before it closed", () =>
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

    it.effect("hands the tabs it opened over to its own opener", () =>
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
      "for the last tab of a window, closes the window too and moves focus to the previously focused window",
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

  describe("closing the active tab", () => {
    it.effect("emits TabActivated for the tab to its right after TabRemoved", () =>
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

    it.effect("activates the tab to its left when it is the rightmost tab", () =>
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

    it.effect("prefers a tab it opened over the tab to its right", () =>
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

    it.effect("prefers the adjacent tab in its group over the adjacent tab outside it", () =>
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

    it.effect("skips tabs in collapsed groups", () =>
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

  describe("opening a tab", () => {
    it.effect("without an index, opens it at the end and emits TabActivated after TabCreated", () =>
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

    it.effect("with active: false, leaves the active tab as it was", () =>
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

    it.effect("without a window, opens it in the focused window", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const focused = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedWindow({ tabs: [{}], focused: false })

        const created = yield* tabs.create({})

        assert.strictEqual(created.windowId, focused.windowId)
      }),
    )

    it.effect("places a pinned tab at the end of the pinned area", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{ pinned: true }, {}, {}] })

        const created = yield* tabs.create({ pinned: true })

        assert.strictEqual(created.index, 1)
      }),
    )

    it.effect(
      "places an unpinned tab after the pinned area even when given an index inside it",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs
          yield* fake.seedWindow({ tabs: [{ pinned: true }, { pinned: true }, {}] })

          const created = yield* tabs.create({ index: 0 })

          assert.strictEqual(created.index, 2)
        }),
    )

    it.effect("puts a tab opened between two tabs of a group into that group", () =>
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

    it.effect("keeps a tab opened right after a group out of the group", () =>
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

    it.effect("fails with an opener in another window", () =>
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

  describe("moving a tab within its window", () => {
    it.effect("emits TabMoved and shifts the tabs in between", () =>
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

    it.effect("moves it to the end with end", () =>
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

    it.effect("places several tabs from index in the order given", () =>
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

    it.effect(
      "stops an unpinned tab at the pinned boundary instead of entering the pinned area",
      () =>
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

    it.effect("puts a tab moved inside a group into the group after TabMoved", () =>
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

    it.effect("takes a tab moved out of its group out of the group", () =>
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

    it.effect("keeps the only tab of a group in the group when it moves", () =>
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

  describe("moving a tab to another window", () => {
    it.effect("emits TabDetached, TabActivated in the old window, then TabAttached", () =>
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

    it.effect("does not make it active in the new window", () =>
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

    it.effect("closes the old window when it was the last tab there", () =>
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

    it.effect("takes a grouped tab out of its group", () =>
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

  describe("updating a tab", () => {
    it.effect("activating it emits TabActivated and sets lastAccessed to the current time", () =>
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

    it.effect("activating the active tab emits nothing", () =>
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
      "activating a tab in a collapsed group expands the group before activating the tab",
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

    it.effect("unpinning it moves it to the start of the unpinned area", () =>
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

    it.effect("changing the URL emits TabUpdated with the url change", () =>
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

    it.effect("muting it emits TabUpdated with the muted change", () =>
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

    it.effect("fails for a tab that does not exist", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs

        const error = yield* Effect.flip(tabs.update(missingTab, { active: true }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("grouping tabs", () => {
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

    it.effect("gathers separated tabs right after the first one", () =>
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

    it.effect("places tabs added to an existing group at the group's end", () =>
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

    it.effect("unpins a pinned tab before it joins the group", () =>
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

    it.effect("gives a new group a color not yet used in the window", () =>
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

    it.effect("moves a tab from another window to the group's window before it joins", () =>
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

    it.effect("fails with a group that does not exist", () =>
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

  describe("ungrouping tabs", () => {
    it.effect("moves a tab from the left half of the group out to its left", () =>
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

    it.effect("moves a tab from the right half of the group out to its right", () =>
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

    it.effect("removes the group once all its tabs are out", () =>
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

  describe("duplicating a tab", () => {
    it.effect("opens the same page in a new active tab right after the original", () =>
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

    it.effect("cannot duplicate a tab that does not exist", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip((yield* Tabs).duplicate(missingTab))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("discarding a tab", () => {
    it.effect("cannot discard the active tab", () =>
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

    it.effect("activating a discarded tab activates it, then reloads it", () =>
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

  describe("querying tabs", () => {
    it.effect("with a groupId of None, returns only tabs in no group", () =>
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

    it.effect("with lastFocusedWindow, returns only the focused window's tabs", () =>
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

  describe("splitting two tabs", () => {
    it.effect(
      "puts both tabs in the returned split view and emits the changes in tab strip order",
      () =>
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

    it.effect("can split two pinned tabs", () =>
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

    it.effect("can split two tabs in the same group", () =>
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

    it.effect("cannot split tabs that are not adjacent", () =>
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

    it.effect("cannot split a tab with itself", () =>
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

    it.effect("cannot split with a tab in another window", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const here = yield* fake.seedWindow({ tabs: [{}] })
        const elsewhere = yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.createSplit([here.tabIds[0], elsewhere.tabIds[0]]))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("cannot split a tab already in a split view", () =>
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

    it.effect("cannot split tabs that differ in pinning", () =>
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

    it.effect("cannot split tabs that differ in group", () =>
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

  describe("unsplitting a split view", () => {
    it.effect("takes both tabs out and emits the changes in tab strip order", () =>
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

    it.effect("cannot unsplit a split view that does not exist", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}] })

        const error = yield* Effect.flip(tabs.unsplit(missingSplitView))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("closing a tab in a split view", () => {
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

  describe("moving tabs in a split view", () => {
    it.effect("moving just one takes both out of the split view", () =>
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

    it.effect(
      "moving both with another tab placed between them takes both out of the split view",
      () =>
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

    it.effect("moving just one to another window takes both out of the split view", () =>
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

  describe("changing the pinning or group of a tab in a split view", () => {
    it.effect("pinning one takes both out of the split view", () =>
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

  describe("opening a tab split with an existing tab", () => {
    it.effect("opens it to the right and puts both in the split view after TabCreated", () =>
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

    it.effect("opens it to the left when index is that tab's position", () =>
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

    it.effect("fails with an index not next to that tab", () =>
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

    it.effect("fails with another window", () =>
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

    it.effect("cannot split with a tab already in a split view", () =>
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

    it.effect("fails with pinning that differs from that tab's", () =>
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

    it.effect("puts the new tab in that tab's group", () =>
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

    it.effect("pins the new tab when splitting with a pinned tab", () =>
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
  "the fake Tabs on Chrome without the split view API",
  (it) => {
    it.effect("reports that the split view API is missing", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs

        assert.isFalse(tabs.supportsSplitView)
      }),
    )

    it.effect("still reads split views the user made", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [left],
          splitViewIds,
        } = yield* fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }] })

        assert.deepStrictEqual(yield* splitViewOf(left), Option.some(splitViewIds.a))
      }),
    )

    it.effect("cannot create a split view", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const { tabIds } = yield* fake.seedWindow({ tabs: [{}, {}] })

        const error = yield* Effect.flip(tabs.createSplit(tabIds))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("cannot unsplit a split view", () =>
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

    it.effect("cannot open a tab split with an existing tab", () =>
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
