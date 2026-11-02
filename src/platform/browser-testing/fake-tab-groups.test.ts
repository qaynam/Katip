import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { type BrowserEvent, TabGroupId, TabGroups, Tabs, type WindowId } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

const tabOrderIn = (windowId: WindowId) =>
  Tabs.use((tabs) => tabs.query({ windowId })).pipe(
    Effect.map((found) => found.map(({ id }) => id)),
  )

layer(FakeBrowser.layer, { buildPerTest: true })("TabGroups の fake", (it) => {
  describe("グループを更新したとき", () => {
    it.effect("タイトルと色が変わり、TabGroupUpdated が発火する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { color: "grey" } },
        })

        const updated = yield* groups.update(groupIds.work, { title: "仕事", color: "red" })

        assert.deepStrictEqual([updated.title, updated.color], [Option.some("仕事"), "red"])
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "TabGroupUpdated", group: updated },
        ])
      }),
    )

    it.effect("何も変わらなければ発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { title: "仕事", color: "grey" } },
        })

        yield* groups.update(groupIds.work, { title: "仕事", color: "grey" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("空文字のタイトルにすると無題になる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const { groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }],
          groups: { work: { title: "仕事" } },
        })

        const updated = yield* groups.update(groupIds.work, { title: "" })

        assert.deepStrictEqual(updated.title, Option.none())
      }),
    )

    it.effect("存在しないグループは失敗する", () =>
      Effect.gen(function* () {
        const groups = yield* TabGroups

        const error = yield* Effect.flip(groups.update(TabGroupId.make(9999), { title: "x" }))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("アクティブなタブを含むグループを折りたたんだとき", () => {
    it.effect("アクティブなタブは変わらず、TabGroupUpdated だけが発火する", () =>
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

  describe("グループを動かしたとき", () => {
    it.effect("グループのタブがまとまって動き、最後に TabGroupMoved が発火する", () =>
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

    it.effect("index はグループの先頭のタブが来る位置を表す", () =>
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

    it.effect("別のグループの途中へは動かせない", () =>
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

    it.effect("ピン留めしたタブの間へは動かせない", () =>
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

    it.effect("別のウィンドウへ動かすと、グループごと移る", () =>
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

  describe("グループを探したとき", () => {
    it.effect("ウィンドウを指定すると、そのウィンドウのグループだけを返す", () =>
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
