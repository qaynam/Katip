import { assert, describe, layer } from "@effect/vitest"
import { Effect, Option } from "effect"
import { type BrowserEvent, Tabs, WindowId, Windows } from "#platform/browser"
import { FakeBrowser } from "./fake-browser"

const tagsOf = (events: ReadonlyArray<BrowserEvent>) => events.map(({ _tag }) => _tag)

layer(FakeBrowser.layer, { buildPerTest: true })("Windows の fake", (it) => {
  describe("ウィンドウを作ったとき", () => {
    it.effect("WindowCreated、TabCreated、TabActivated、WindowFocusChanged の順に発火する", () =>
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

    it.effect("指定した URL のタブを 1 つ持つ", () =>
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

    it.effect("popup で位置と大きさを指定すると、その種類・位置・大きさのウィンドウになる", () =>
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

    it.effect("種類を指定しなければ通常のウィンドウになる", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const created = yield* windows.create({})

        assert.deepStrictEqual(created.type, Option.some("normal"))
      }),
    )

    it.effect("focused: false で作ると、フォーカスは移らない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const existing = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.create({ focused: false })

        assert.strictEqual((yield* windows.getLastFocused).id, existing.windowId)
      }),
    )
  })

  describe("フォーカスを変えたとき", () => {
    it.effect("別のウィンドウにフォーカスすると WindowFocusChanged が発火する", () =>
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

    it.effect("既にフォーカスしているウィンドウなら発火しない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const focused = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.update(focused.windowId, { focused: true })

        assert.deepStrictEqual(yield* fake.takeEmittedEvents, [])
      }),
    )

    it.effect("フォーカスを外すと、直前にフォーカスしていたウィンドウへ移る", () =>
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

  describe("仕込んだウィンドウ", () => {
    it.effect("位置と大きさを指定すれば、それを持つ", () =>
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

  describe("拡張がウィンドウを閉じたとき", () => {
    it.effect("中のタブは isWindowClosing で閉じ、最後に WindowRemoved が発火する", () =>
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

    it.effect("閉じたウィンドウはもう取得できない", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const windows = yield* Windows
        const { windowId } = yield* fake.seedWindow({ tabs: [{}] })

        yield* windows.remove(windowId)

        assert.deepStrictEqual(yield* windows.getAll, [])
      }),
    )

    it.effect("存在しないウィンドウを閉じようとすると失敗する", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const error = yield* Effect.flip(windows.remove(WindowId.make(999)))

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("ウィンドウが無いとき", () => {
    it.effect("最後にフォーカスしたウィンドウを求めると失敗する", () =>
      Effect.gen(function* () {
        const windows = yield* Windows

        const error = yield* Effect.flip(windows.getLastFocused)

        assert.strictEqual(error._tag, "BrowserApiError")
      }),
    )
  })

  describe("ユーザーがウィンドウを閉じたとき", () => {
    it.effect("各タブが isWindowClosing で閉じた後に、グループと WindowRemoved が続く", () =>
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [{}] })
        const closing = yield* fake.seedWindow({
          tabs: [{ group: "work" }, {}],
          groups: { work: {} },
        })

        yield* fake.closeWindow(closing.windowId)

        const events = yield* fake.takeEmittedEvents
        assert.deepStrictEqual(tagsOf(events), [
          "TabRemoved",
          "TabGroupRemoved",
          "TabRemoved",
          "WindowRemoved",
        ])
        assert.isTrue(events.every((event) => event._tag !== "TabRemoved" || event.isWindowClosing))
      }),
    )

    it.effect("フォーカスしていたウィンドウなら、直前のウィンドウへフォーカスが移る", () =>
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

    it.effect("閉じている途中で別のタブがアクティブになることはない", () =>
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
