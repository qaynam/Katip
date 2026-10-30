import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, type Scope } from "effect"
import { spotlightBoundsOver } from "#modules/spotlight"
import { type BrowserTab, Tabs, type WindowId, Windows } from "#platform/browser"
import { FakeBrowser } from "#platform/browser-testing"
import { callerWindowOfSpotlight } from "#protocol"
import { ExtensionInfo } from "./extension-info"
import { KeyboardCommand, runKeyboardCommand } from "./keyboard-commands"
import { applicationLayer } from "./program"
import { openSpotlight } from "./spotlight-window"
import { backgroundTestLayer } from "./testing/background-harness"

const testLayer = applicationLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(backgroundTestLayer, ExtensionInfo.layerTest)),
)

const inBackground = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof testLayer> | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(testLayer))

const popupWindows = Windows.use((windows) =>
  Effect.map(windows.getAll, (all) =>
    all.filter((window) => Option.contains(window.type, "popup")),
  ),
)

const callerOf = (tab: BrowserTab) => Option.flatMap(tab.url, callerWindowOfSpotlight)

const spotlightTabs = Tabs.use((tabs) =>
  Effect.map(tabs.query({}), (all) => all.filter((tab) => Option.isSome(callerOf(tab)))),
)

const focusedWindowId = Windows.use((windows) =>
  Effect.map(windows.getLastFocused, (window) => window.id),
)

const bounds = { left: 100, top: 50, width: 1440, height: 900 }

describe("Spotlight を開く", () => {
  describe("まだ開いていないとき", () => {
    it.effect("呼び出し元のウィンドウに重ねて、決まった位置と大きさのポップアップで開く", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{}], bounds })

          yield* openSpotlight(windowId)

          const [popup] = yield* popupWindows
          expect(popup?.bounds).toStrictEqual(Option.some(spotlightBoundsOver(bounds)))
        }),
      ),
    )

    it.effect("開いたページは呼び出し元のウィンドウを知っている", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })

          yield* openSpotlight(windowId)

          const [spotlight] = yield* spotlightTabs
          expect(Option.flatMap(Option.fromNullishOr(spotlight), callerOf)).toStrictEqual(
            Option.some(windowId),
          )
        }),
      ),
    )

    it.effect("Spotlight のウィンドウにフォーカスが移る", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })

          yield* openSpotlight(windowId)

          const [spotlight] = yield* spotlightTabs
          expect(yield* focusedWindowId).toBe(spotlight?.windowId)
        }),
      ),
    )

    it.effect("Space を持たないポップアップのウィンドウからは開かない", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const windows = yield* Windows
          yield* fake.seedWindow({ tabs: [{}] })
          const popup = yield* windows.create({ type: "popup", url: "https://chat.example/" })

          yield* openSpotlight(popup.id)

          expect(yield* spotlightTabs).toStrictEqual([])
        }),
      ),
    )
  })

  describe("既に開いているとき", () => {
    it.effect("同じウィンドウから開き直すと、新しく開かずに前面へ出す", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const windows = yield* Windows
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
          yield* openSpotlight(windowId)
          yield* windows.update(windowId, { focused: true })

          yield* openSpotlight(windowId)

          const opened = yield* spotlightTabs
          expect(opened).toHaveLength(1)
          expect(yield* focusedWindowId).toBe(opened[0]?.windowId)
        }),
      ),
    )

    it.effect("Spotlight の中から開き直しても、新しくは開かない", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const { windowId } = yield* fake.seedWindow({ tabs: [{}] })
          yield* openSpotlight(windowId)
          const [first] = yield* spotlightTabs

          yield* openSpotlight(first?.windowId ?? windowId)

          expect((yield* spotlightTabs).map((tab) => tab.id)).toStrictEqual([first?.id])
        }),
      ),
    )

    it.effect("別のウィンドウから開くと、そのウィンドウのための Spotlight 1 つに置き換わる", () =>
      inBackground(
        Effect.gen(function* () {
          const fake = yield* FakeBrowser
          const first = yield* fake.seedWindow({ tabs: [{}] })
          const second = yield* fake.seedWindow({ tabs: [{}] })
          yield* openSpotlight(first.windowId)

          yield* openSpotlight(second.windowId)

          expect((yield* spotlightTabs).map(callerOf)).toStrictEqual([Option.some(second.windowId)])
        }),
      ),
    )
  })
})

describe("キーボードショートカット", () => {
  it.effect("押したときにアクティブだったタブのウィンドウから Spotlight を開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        const tabs = yield* Tabs
        yield* fake.seedWindow({ tabs: [{}] })
        const pressed = yield* fake.seedWindow({ tabs: [{}] })
        const activeTab = yield* tabs.get(pressed.tabIds[0])

        yield* runKeyboardCommand(KeyboardCommand.openSpotlight, Option.some(activeTab))

        expect((yield* spotlightTabs).map(callerOf)).toStrictEqual([Option.some(pressed.windowId)])
      }),
    ),
  )

  it.effect("アクティブなタブが分からなければ、最後にフォーカスしたウィンドウから開く", () =>
    inBackground(
      Effect.gen(function* () {
        const fake = yield* FakeBrowser
        yield* fake.seedWindow({ tabs: [{}] })
        const focused = yield* fake.seedWindow({ tabs: [{}], focused: true })

        yield* runKeyboardCommand(KeyboardCommand.openSpotlight, Option.none())

        expect((yield* spotlightTabs).map(callerOf)).toStrictEqual([
          Option.some<WindowId>(focused.windowId),
        ])
      }),
    ),
  )
})
