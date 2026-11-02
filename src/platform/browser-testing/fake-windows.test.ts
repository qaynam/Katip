import { assert, describe, layer } from "@effect/vitest"
import { Effect, Match, Option } from "effect"
import { type BrowserEvent, Tabs, WindowId, Windows } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

layer(FakeBrowser.layer, { buildPerTest: true })("the fake Windows", (it) => {
  describe("creating a window", () => {
    it.effect("emits WindowCreated, TabCreated, TabActivated, then WindowFocusChanged", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        yield* fake.seedWindow({ tabs: [{}] })

        const created = yield* windows.create({ url: "https://example.com/" })

        assert.isTrue(created.focused)
        assert.deepStrictEqual(tagsOf(yield* fake.takeEmittedEvents), [
          "WindowCreated",
          "TabCreated",
          "TabActivated",
          "WindowFocusChanged",
        ])
      }),
    )

    it.effect("has one tab with the given URL", () =>
      Effect.gen(function* () {
        const windows = yield* Windows
        const tabs = yield* Tabs

        const created = yield* windows.create({ url: "https://example.com/" })

        assert.deepStrictEqual(
          (yield* tabs.query({ windowId: created.id })).map(({ url }) => url),
          [Option.some("https://example.com/")],
        )
      }),
    )

    it.effect("as a popup with bounds, has that type, position and size", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const created = yield* windows.create({
          type: "popup",
          left: 300,
          top: 120,
          width: 640,
          height: 420,
        })

        assert.deepStrictEqual(
          [created.type, created.bounds],
          [Option.some("popup"), Option.some({ left: 300, top: 120, width: 640, height: 420 })],
        )
      }),
    )

    it.effect("without a type, is a normal window", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const created = yield* windows.create({})

        assert.deepStrictEqual(created.type, Option.some("normal"))
      }),
    )

    it.effect("with focused: false, leaves focus where it was", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const existing = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.create({ focused: false })

        assert.strictEqual((yield* windows.getLastFocused).id, existing.windowId)
      }),
    )
  })

  describe("changing focus", () => {
    it.effect("focusing another window emits WindowFocusChanged", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        yield* fake.seedWindow({ tabs: [{}] })
        const other = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.update(other.windowId, { focused: true })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [
          { _tag: "WindowFocusChanged", windowId: Option.some(other.windowId) },
        ])
      }),
    )

    it.effect("focusing the focused window emits nothing", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const focused = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.update(focused.windowId, { focused: true })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("unfocusing moves focus to the previously focused window", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const earlier = yield* fake.seedWindow({ tabs: [{}] })
        const focused = yield* fake.seedWindow({ tabs: [{}], focused: true })

        yield* windows.update(focused.windowId, { focused: false })

        assert.strictEqual((yield* windows.getLastFocused).id, earlier.windowId)
      }),
    )
  })

  describe("a seeded window", () => {
    it.effect("has the bounds it was seeded with", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const bounds = { left: 40, top: 30, width: 1000, height: 700 }
        const { windowId } = yield* fake.seedWindow({ tabs: [{}], bounds })

        const window = yield* windows.get(windowId)

        assert.deepStrictEqual(window.bounds, Option.some(bounds))
      }),
    )
  })

  describe("when the extension closes a window", () => {
    it.effect("closes its tabs with isWindowClosing and emits WindowRemoved last", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        yield* fake.seedWindow({ tabs: [{}] })
        const closing = yield* fake.seedWindow({ tabs: [{}, {}] })

        yield* windows.remove(closing.windowId)

        const events = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(tagsOf(events), ["TabRemoved", "TabRemoved", "WindowRemoved"])
        assert.isTrue(events.every((event) => event._tag !== "TabRemoved" || event.isWindowClosing))
      }),
    )

    it.effect("the closed window can no longer be fetched", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.remove(windowId)

        assert.deepStrictEqual(yield* windows.getAll, [])
      }),
    )

    it.effect("closing a window that does not exist fails", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const error = yield* Effect.flip(windows.remove(WindowId.make(999)))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("with no windows", () => {
    it.effect("asking for the last focused window fails", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const error = yield* Effect.flip(windows.getLastFocused)

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("when the user closes a window", () => {
    it.effect(
      "releases groups and pinning from the right, removes tabs from the right with isWindowClosing, then emits WindowRemoved",
      () =>
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          yield* fake.seedWindow({ tabs: [{}] })
          const {
            windowId,
            tabIds: [pinned, grouped, plain],
          } = yield* fake.seedWindow({
            tabs: [{ pinned: true }, { group: "work" }, {}],
            groups: { work: {} },
          })

          yield* fake.closeWindow(windowId)

          assert.deepStrictEqual(
            (yield* fake.takeEmittedEvents).map((event) =>
              Match.value(event).pipe(
                Match.tag("TabUpdated", ({ tabId, changes }) => [tabId, changes]),
                Match.tag("TabRemoved", ({ tabId, isWindowClosing }) => [tabId, isWindowClosing]),
                Match.orElse(({ _tag }) => _tag),
              ),
            ),
            [
              [grouped, { groupId: Option.none() }],
              "TabGroupRemoved",
              [pinned, { pinned: false }],
              [plain, true],
              [grouped, true],
              [pinned, true],
              "WindowRemoved",
            ],
          )
        }),
    )

    it.effect("closing the focused window moves focus to the previous window", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const earlier = yield* fake.seedWindow({ tabs: [{}] })
        const closing = yield* fake.seedWindow({ tabs: [{}], focused: true })

        yield* fake.closeWindow(closing.windowId)

        assert.deepStrictEqual((yield* fake.takeEmittedEvents).at(-1), {
          _tag: "WindowFocusChanged",
          windowId: Option.some(earlier.windowId),
        })
      }),
    )

    it.effect("activates no other tab while closing", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const closing = yield* fake.seedWindow({ tabs: [{ active: true }, {}, {}] })

        yield* fake.closeWindow(closing.windowId)

        assert.isFalse(
          (yield* fake.takeEmittedEvents).some((event) => event._tag === "TabActivated"),
        )
      }),
    )
  })
})
