import { assert, describe, layer } from "@effect/vitest"
import { Effect, Exit, Option, Ref, Stream } from "effect"
import { BrowserEvents, TabGroups, Tabs, Windows } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

layer(FakeBrowser.layer, { buildPerTest: true })("FakeBrowser", (it) => {
  describe("ウィンドウを仕込んだとき", () => {
    it.effect("仕込んだ順に index が振られ、イベントは発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs

        const { windowId, tabIds } = yield* fake.seedWindow({ tabs: [{}, {}, {}] })

        assert.deepStrictEqual(
          (yield* tabs.query({ windowId })).map(({ id, index }) => [id, index]),
          tabIds.map((id, index) => [id, index]),
        )
        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("active を指定しなければ、先頭のタブがアクティブになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs

        const {
          tabIds: [first],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        assert.isTrue((yield* tabs.get(first)).active)
      }),
    )

    it.effect("最初に仕込んだウィンドウだけがフォーカスされる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows

        const first = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.seedWindow({ tabs: [{}] })

        assert.deepStrictEqual(
          (yield* windows.getAll).map(({ id, focused }) => [id === first.windowId, focused]),
          [
            [true, true],
            [false, false],
          ],
        )
      }),
    )

    it.effect("グループの見た目と所属が仕込んだとおりになる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups

        const { windowId, groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, {}],
          groups: { work: { title: "仕事", color: "green", collapsed: true } },
        })

        assert.deepStrictEqual(yield* groups.get(groupIds.work), {
          id: groupIds.work,
          windowId,
          title: Option.some("仕事"),
          color: "green",
          collapsed: true,
        })
      }),
    )

    it.effect("グループのタブが連続していなければ die する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(
          fake.seedWindow({
            tabs: [{ group: "work" }, {}, { group: "work" }],
            groups: { work: {} },
          }),
        )

        assert.isTrue(Exit.hasDies(exit))
      }),
    )

    it.effect("ピン留めしたタブがピン留めしていないタブより後ろにあれば die する", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(fake.seedWindow({ tabs: [{}, { pinned: true }] }))

        assert.isTrue(Exit.hasDies(exit))
      }),
    )
  })

  describe("BrowserEvents を購読したとき", () => {
    it.effect("購読する前に起きたイベントも、最初の購読者が起きた順に受け取る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const events = yield* BrowserEvents
        yield* fake.seedWindow({ tabs: [{}] })
        yield* tabs.create({})

        const received = yield* events.events.pipe(Stream.take(2), Stream.runCollect)

        assert.deepStrictEqual(
          received.map(({ _tag }) => _tag),
          ["TabCreated", "TabActivated"],
        )
      }),
    )

    it.effect("emit したイベントは、状態を変えずにそのまま流れる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const events = yield* BrowserEvents
        const command = {
          _tag: "CommandTriggered",
          command: "open-sidebar",
          tab: Option.none(),
        } as const

        yield* fake.emit(command)

        assert.deepStrictEqual(yield* events.events.pipe(Stream.take(1), Stream.runCollect), [
          command,
        ])
        assert.deepStrictEqual((yield* fake.snapshot).tabs, [])
      }),
    )
  })

  describe("発火したイベントを取り出したとき", () => {
    it.effect("取り出した後は、次に発火するまで空になる", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}] })
        yield* tabs.create({})

        yield* fake.takeEmittedEvents

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )
  })

  describe("ページの側で変化が起きたとき", () => {
    it.effect("値が変わった項目だけが TabUpdated の changes に入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{ title: "同じ", status: "loading" }] })

        yield* fake.updatePage(tab, { title: "同じ", status: "complete", audible: true })

        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event,
          ),
          [{ status: "complete", audible: true }],
        )
      }),
    )

    it.effect("何も変わらなければ発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{ title: "同じ" }] })

        yield* fake.updatePage(tab, { title: "同じ" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )
  })

  describe("失敗を仕込んだとき", () => {
    it.effect("仕込んだ API の次の呼び出しだけが失敗し、状態もイベントも変わらない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
        yield* fake.failNext("tabs.create")

        const failed = yield* Effect.exit(tabs.create({}))
        const tabsAfterFailure = yield* tabs.query({ windowId })
        const eventsAfterFailure = yield* fake.takeEmittedEvents
        yield* tabs.create({})

        assert.isTrue(Exit.isFailure(failed))
        assert.strictEqual(tabsAfterFailure.length, 1)
        assert.deepStrictEqual(eventsAfterFailure, [])
        assert.strictEqual((yield* tabs.query({ windowId })).length, 2)
      }),
    )

    it.effect("渡した原因が BrowserApiError の cause に入る", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const cause = new Error("quota exceeded")
        yield* fake.failNext("tabGroups.query", cause)

        const error = yield* Effect.flip(groups.query({}))

        assert.deepStrictEqual([error.api, error.cause], ["tabGroups.query", cause])
      }),
    )

    it.effect("別の API の呼び出しは失敗しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.failNext("tabs.remove")

        const exit = yield* Effect.exit(tabs.query({}))

        assert.isTrue(Exit.isSuccess(exit))
      }),
    )
  })

  describe("Chrome API を呼んだとき", () => {
    it.effect("答えを返す前に、ほかの処理に順番を譲る", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs
        const order = yield* Ref.make<ReadonlyArray<string>>([])
        const record = (label: string) => Ref.update(order, (labels) => [...labels, label])

        yield* Effect.all([Effect.andThen(tabs.query({}), record("query")), record("other")], {
          concurrency: "unbounded",
        })

        assert.deepStrictEqual(yield* Ref.get(order), ["other", "query"])
      }),
    )
  })
})
