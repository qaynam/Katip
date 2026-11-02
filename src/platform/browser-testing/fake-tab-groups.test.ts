import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { type BrowserEvent, TabGroupId, TabGroups, Tabs, type WindowId } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

const tabOrderIn = (windowId: WindowId) =>
  Tabs.use((tabs) => tabs.query({ windowId })).pipe(
    Effect.map((found) => found.map(({ id }) => id)),
  )

layer(FakeBrowser.layer, { buildPerTest: true })("the fake TabGroups", (it) => {
  describe("updating a group", () => {
    it.effect("changes the title and color and emits TabGroupUpdated", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { color: "grey" } },
        })

        const updated = yield* groups.update(groupIds.work, { title: "Work", color: "red" })

        assert.deepStrictEqual([updated.title, updated.color], [Option.some("Work"), "red"])
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabGroupUpdated", group: updated },
        ])
      }),
    )

    it.effect("emits nothing when nothing changes", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { title: "Work", color: "grey" } },
        })

        yield* groups.update(groupIds.work, { title: "Work", color: "grey" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("an empty title makes the group untitled", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { title: "Work" } },
        })

        const updated = yield* groups.update(groupIds.work, { title: "" })

        assert.deepStrictEqual(updated.title, Option.none())
      }),
    )

    it.effect("fails for a group that does not exist", () =>
      Effect.gen(function* () {
        const groups = yield* TabGroups

        const error = yield* Effect.flip(groups.update(TabGroupId.make(9999), { title: "x" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("collapsing a group that contains the active tab", () => {
    it.effect("keeps the active tab and emits only TabGroupUpdated", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const tabs = yield* Tabs
        const {
          tabIds: [, active],
          groupIds,
        } = yield* fake.seedWindow({
          tabs: [{}, { group: "work", active: true }, {}],
          groups: { work: {} },
        })

        yield* groups.update(groupIds.work, { collapsed: true })

        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), ["TabGroupUpdated"])
        assert.isTrue((yield* tabs.get(active)).active)
      }),
    )
  })

  describe("moving a group", () => {
    it.effect("moves the group's tabs together and emits TabGroupMoved last", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const {
          windowId,
          tabIds: [g1, g2, a, b],
          groupIds,
        } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, { group: "work" }, {}, {}],
          groups: { work: {} },
        })

        yield* groups.move(groupIds.work, { index: "end" })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [a, b, g1, g2])
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "TabMoved",
          "TabMoved",
          "TabGroupMoved",
        ])
      }),
    )

    it.effect("treats index as where the group's first tab lands", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const {
          windowId,
          tabIds: [a, b, g1, g2],
          groupIds,
        } = yield* fake.seedWindow({
          tabs: [{}, {}, { group: "work" }, { group: "work" }],
          groups: { work: {} },
        })

        yield* groups.move(groupIds.work, { index: 1 })

        assert.deepStrictEqual(yield* tabOrderIn(windowId), [a, g1, g2, b])
      }),
    )

    it.effect("cannot move into the middle of another group", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "a" }, { group: "a" }, { group: "b" }],
          groups: { a: {}, b: {} },
        })

        const error = yield* Effect.flip(groups.move(groupIds.b, { index: 1 }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("cannot move among pinned tabs", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ pinned: true }, { pinned: true }, { group: "work" }],
          groups: { work: {} },
        })

        const error = yield* Effect.flip(groups.move(groupIds.work, { index: 1 }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )

    it.effect("moving to another window takes the whole group along", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const tabs = yield* Tabs
        const home = yield* fake.seedWindow({
          tabs: [{}, { group: "work" }, { group: "work" }],
          groups: { work: {} },
        })
        const away = yield* fake.seedWindow({ tabs: [{}] })

        const moved = yield* groups.move(home.groupIds.work, {
          index: "end",
          windowId: away.windowId,
        })

        assert.strictEqual(moved.windowId, away.windowId)
        assert.deepStrictEqual(
          (yield* tabs.query({ groupId: Option.some(home.groupIds.work) })).map(
            ({ windowId, index }) => [windowId, index],
          ),
          [
            [away.windowId, 1],
            [away.windowId, 2],
          ],
        )
      }),
    )
  })

  describe("querying groups", () => {
    it.effect("with a window, returns only that window's groups", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const here = yield* fake.seedWindow({ tabs: [{ group: "a" }], groups: { a: {} } })
        yield* fake.seedWindow({ tabs: [{ group: "b" }], groups: { b: {} } })

        const found = yield* groups.query({ windowId: here.windowId })

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [here.groupIds.a],
        )
      }),
    )
  })
})
