import { Effect, Option, Ref } from "effect"
import { WindowId, Windows } from "#platform/browser"
import { DEFAULT_WINDOW_BOUNDS, focusedWindowId, issueId, toBrowserWindow } from "./browsing-state"
import {
  blurWindow,
  closeWindowIfEmpty,
  createTab,
  detachTab,
  focusWindow,
  NEW_TAB_URL,
  removeGroupIfEmpty,
  requireWindow,
} from "./browsing-steps"
import { type BrowsingTx, chromeCall, type FakeWorld, transact } from "./fake-world"

const snapshotOf = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const window = yield* requireWindow(tx, windowId)
  return toBrowserWindow(yield* tx.state, window)
})

/** ウィンドウを閉じる。タブは `isWindowClosing: true` で閉じ、閉じている途中で別のタブをアクティブにしない。 */
export const closeWindowWithTabs = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  windowId: WindowId,
) {
  const window = yield* requireWindow(tx, windowId)
  yield* Effect.forEach(
    window.tabs,
    Effect.fnUntraced(function* (tab) {
      yield* detachTab(tx, tab.id)
      yield* tx.emit({ _tag: "TabRemoved", tabId: tab.id, windowId, isWindowClosing: true })
      yield* removeGroupIfEmpty(tx, tab.groupId, windowId)
    }),
    { discard: true },
  )
  yield* closeWindowIfEmpty(tx, windowId)
})

export const makeFakeWindows = (world: FakeWorld): Windows["Service"] =>
  Windows.of({
    getAll: chromeCall(
      world,
      "windows.getAll",
      Effect.map(Ref.get(world.browsing), (state) =>
        state.windows.map((window) => toBrowserWindow(state, window)),
      ),
    ),

    get: (windowId) => transact(world, "windows.get", (tx) => snapshotOf(tx, windowId)),

    getLastFocused: transact(
      world,
      "windows.getLastFocused",
      Effect.fnUntraced(function* (tx) {
        const windowId = focusedWindowId(yield* tx.state)
        if (Option.isNone(windowId)) return yield* tx.reject("No last-focused window")
        return yield* snapshotOf(tx, windowId.value)
      }),
    ),

    create: (options) =>
      transact(
        world,
        "windows.create",
        Effect.fnUntraced(function* (tx) {
          const [id, issued] = issueId(yield* tx.state)
          const windowId = WindowId.make(id)
          yield* tx.setState({
            ...issued,
            windows: [
              ...issued.windows,
              {
                id: windowId,
                type: options.type ?? "normal",
                bounds: {
                  left: options.left ?? DEFAULT_WINDOW_BOUNDS.left,
                  top: options.top ?? DEFAULT_WINDOW_BOUNDS.top,
                  width: options.width ?? DEFAULT_WINDOW_BOUNDS.width,
                  height: options.height ?? DEFAULT_WINDOW_BOUNDS.height,
                },
                tabs: [],
                activeTabId: Option.none(),
              },
            ],
            focusOrder: [...issued.focusOrder, windowId],
          })
          yield* tx.emit({ _tag: "WindowCreated", window: yield* snapshotOf(tx, windowId) })
          yield* createTab(tx, {
            windowId,
            index: "end",
            url: options.url ?? NEW_TAB_URL,
            active: true,
            pinned: false,
            openerTabId: Option.none(),
          })
          if (options.focused ?? true) yield* focusWindow(tx, windowId)
          return yield* snapshotOf(tx, windowId)
        }),
      ),

    update: (windowId, options) =>
      transact(
        world,
        "windows.update",
        Effect.fnUntraced(function* (tx) {
          yield* requireWindow(tx, windowId)
          if (options.focused === true) yield* focusWindow(tx, windowId)
          if (options.focused === false) yield* blurWindow(tx, windowId)
          return yield* snapshotOf(tx, windowId)
        }),
      ),

    remove: (windowId) =>
      transact(world, "windows.remove", (tx) => closeWindowWithTabs(tx, windowId)),
  })
