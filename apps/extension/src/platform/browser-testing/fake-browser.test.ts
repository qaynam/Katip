import { assert, describe, layer } from "@effect/vitest"
import { Effect, Exit, Option, Ref, Stream } from "effect"
import { BrowserEvents, TabGroups, Tabs, Windows } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

layer(FakeBrowser.layer, { buildPerTest: true })("FakeBrowser", (it) => {
  describe("seeding a window", () => {
    it.effect("numbers the tabs in seeding order without firing events", () =>
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

    it.effect("makes the first tab active when no tab is marked active", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs

        const {
          tabIds: [first],
        } = yield* fake.seedWindow({ tabs: [{}, {}] })

        assert.isTrue((yield* tabs.get(first)).active)
      }),
    )

    it.effect("focuses only the first window seeded", () =>
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

    it.effect("gives groups the seeded appearance and members", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups

        const { windowId, groupIds } = yield* fake.seedWindow({
          tabs: [{ group: "work" }, {}],
          groups: { work: { title: "Work", color: "green", collapsed: true } },
        })

        assert.deepStrictEqual(yield* groups.get(groupIds.work), {
          id: groupIds.work,
          windowId,
          title: Option.some("Work"),
          color: "green",
          collapsed: true,
        })
      }),
    )

    it.effect("dies when a group's tabs are not contiguous", () =>
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

    it.effect("dies when a pinned tab comes after an unpinned one", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(fake.seedWindow({ tabs: [{}, { pinned: true }] }))

        assert.isTrue(Exit.hasDies(exit))
      }),
    )
  })

  describe("seeding a split view", () => {
    it.effect(
      "puts the two tabs with the same split key in the split view with the returned ID",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const tabs = yield* Tabs

          const { windowId, splitViewIds } = yield* fake.seedWindow({
            tabs: [{}, { split: "a" }, { split: "a" }],
          })

          assert.deepStrictEqual(
            (yield* tabs.query({ windowId })).map(({ splitViewId }) => splitViewId),
            [Option.none(), Option.some(splitViewIds.a), Option.some(splitViewIds.a)],
          )
        }),
    )

    it.effect("makes a separate split view per split key", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const { splitViewIds } = yield* fake.seedWindow({
          tabs: [{ split: "a" }, { split: "a" }, { split: "b" }, { split: "b" }],
        })

        assert.notStrictEqual(splitViewIds.a, splitViewIds.b)
      }),
    )

    it.effect("dies when a split key has only one tab", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(fake.seedWindow({ tabs: [{ split: "a" }, {}] }))

        assert.isTrue(Exit.hasDies(exit))
      }),
    )

    it.effect("dies when a split key has three tabs", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(
          fake.seedWindow({ tabs: [{ split: "a" }, { split: "a" }, { split: "a" }] }),
        )

        assert.isTrue(Exit.hasDies(exit))
      }),
    )

    it.effect("dies when the tabs of a split key are not adjacent", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(
          fake.seedWindow({ tabs: [{ split: "a" }, {}, { split: "a" }] }),
        )

        assert.isTrue(Exit.hasDies(exit))
      }),
    )

    it.effect("dies when the tabs of a split key differ in pinning", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(
          fake.seedWindow({ tabs: [{ split: "a", pinned: true }, { split: "a" }] }),
        )

        assert.isTrue(Exit.hasDies(exit))
      }),
    )

    it.effect("dies when the tabs of a split key differ in group", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser

        const exit = yield* Effect.exit(
          fake.seedWindow({
            tabs: [{ split: "a", group: "work" }, { split: "a" }],
            groups: { work: {} },
          }),
        )

        assert.isTrue(Exit.hasDies(exit))
      }),
    )
  })

  describe("without a Chrome version specified", () => {
    it.effect("behaves as Chrome with the split view API", () =>
      Effect.gen(function* () {
        const tabs = yield* Tabs

        assert.isTrue(tabs.supportsSplitView)
      }),
    )
  })

  describe("subscribing to BrowserEvents", () => {
    it.effect("gives the first subscriber the events from before it subscribed, in order", () =>
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

    it.effect("passes an emitted event through as is without changing the state", () =>
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

  describe("taking the emitted events", () => {
    it.effect("leaves nothing to take until the next event", () =>
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

  describe("when the page changes", () => {
    it.effect("puts only the fields whose values changed in the TabUpdated changes", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{ title: "Same", status: "loading" }] })

        yield* fake.updatePage(tab, { title: "Same", status: "complete", audible: true })

        assert.deepStrictEqual(
          (yield* fake.takeEmittedEvents).map((event) =>
            event._tag === "TabUpdated" ? event.changes : event,
          ),
          [{ status: "complete", audible: true }],
        )
      }),
    )

    it.effect("fires nothing when nothing changes", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const {
          tabIds: [tab],
        } = yield* fake.seedWindow({ tabs: [{ title: "Same" }] })

        yield* fake.updatePage(tab, { title: "Same" })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )
  })

  describe("injecting a failure", () => {
    it.effect("fails only the next call to that API, leaving the state and events unchanged", () =>
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

    it.effect("puts the given cause in the BrowserApiError cause", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const groups = yield* TabGroups
        const cause = new Error("quota exceeded")
        yield* fake.failNext("tabGroups.query", cause)

        const error = yield* Effect.flip(groups.query({}))

        assert.deepStrictEqual([error.api, error.cause], ["tabGroups.query", cause])
      }),
    )

    it.effect("does not fail calls to other APIs", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.failNext("tabs.remove")

        const exit = yield* Effect.exit(tabs.query({}))

        assert.isTrue(Exit.isSuccess(exit))
      }),
    )
  })

  describe("calling a Chrome API", () => {
    it.effect("yields to other work before answering", () =>
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
