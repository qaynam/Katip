import { Array, Effect, Option } from "effect"
import {
  type BrowserApiError,
  type TabChanges,
  type TabGroupId,
  TabId,
  type WindowId,
} from "#platform/browser"
import {
  type BrowsingState,
  clampInsertion,
  clampMove,
  findGroup,
  findWindow,
  focusedWindowId,
  type GroupRecord,
  groupAfterMove,
  groupEnclosingGap,
  groupSnapshot,
  insertAt,
  issueId,
  locateTab,
  markActive,
  pinnedCount,
  relocate,
  replaceGroup,
  replaceWindow,
  sameGroup,
  successorOfActiveTab,
  type TabLocation,
  type TabRecord,
  tabSnapshot,
  toBrowserTabGroup,
  updateTabRecord,
  windowOfGroup,
  type WindowRecord,
} from "./browsing-state"
import type { BrowsingTx } from "./fake-world"

export const NEW_TAB_URL = "chrome://newtab/"

export const modify = (tx: BrowsingTx, update: (state: BrowsingState) => BrowsingState) =>
  Effect.flatMap(tx.state, (state) => tx.setState(update(state)))

export const requireTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
): Effect.fn.Return<TabLocation, BrowserApiError> {
  const located = locateTab(yield* tx.state, tabId)
  if (Option.isNone(located)) return yield* tx.reject(`No tab with id: ${tabId}.`)
  return located.value
})

export const requireWindow = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  windowId: WindowId,
): Effect.fn.Return<WindowRecord, BrowserApiError> {
  const window = findWindow(yield* tx.state, windowId)
  if (Option.isNone(window)) return yield* tx.reject(`No window with id: ${windowId}.`)
  return window.value
})

export const requireGroup = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  groupId: TabGroupId,
): Effect.fn.Return<GroupRecord, BrowserApiError> {
  const group = findGroup(yield* tx.state, groupId)
  if (Option.isNone(group)) return yield* tx.reject(`No group with id: ${groupId}.`)
  return group.value
})

export const requireFocusedWindow = Effect.fnUntraced(function* (
  tx: BrowsingTx,
): Effect.fn.Return<WindowId, BrowserApiError> {
  const windowId = focusedWindowId(yield* tx.state)
  if (Option.isNone(windowId)) return yield* tx.reject("No current window")
  return windowId.value
})

export const updateTab = (tx: BrowsingTx, tabId: TabId, update: (tab: TabRecord) => TabRecord) =>
  modify(tx, (state) => updateTabRecord(state, tabId, update))

export const emitTabUpdated = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  changes: TabChanges,
) {
  const tab = tabSnapshot(yield* tx.state, tabId)
  if (Option.isSome(tab)) yield* tx.emit({ _tag: "TabUpdated", tabId, changes, tab: tab.value })
})

export const updateGroup = Effect.fnUntraced(function* (tx: BrowsingTx, group: GroupRecord) {
  yield* modify(tx, (state) => replaceGroup(state, group))
  const snapshot = groupSnapshot(yield* tx.state, group.id)
  if (Option.isSome(snapshot)) yield* tx.emit({ _tag: "TabGroupUpdated", group: snapshot.value })
})

export const moveWithinWindow = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  toIndex: number,
) {
  const { window, index } = yield* requireTab(tx, tabId)
  if (index === toIndex) return
  yield* modify(tx, (state) =>
    replaceWindow(state, { ...window, tabs: relocate(window.tabs, index, toIndex) }),
  )
  yield* tx.emit({ _tag: "TabMoved", tabId, windowId: window.id, fromIndex: index, toIndex })
})

/** 最後のタブが抜けたグループを消す。`windowId` は消える直前にグループがあったウィンドウ。 */
export const removeGroupIfEmpty = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  groupId: Option.Option<TabGroupId>,
  windowId: WindowId,
) {
  if (Option.isNone(groupId)) return
  const state = yield* tx.state
  const group = findGroup(state, groupId.value)
  if (Option.isNone(group) || Option.isSome(windowOfGroup(state, groupId.value))) return
  yield* tx.setState({ ...state, groups: state.groups.filter(({ id }) => id !== groupId.value) })
  yield* tx.emit({ _tag: "TabGroupRemoved", group: toBrowserTabGroup(group.value, windowId) })
})

export const assignGroup = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  groupId: Option.Option<TabGroupId>,
) {
  const { window, tab } = yield* requireTab(tx, tabId)
  if (sameGroup(tab.groupId, groupId)) return
  yield* updateTab(tx, tabId, (record) => ({ ...record, groupId }))
  yield* emitTabUpdated(tx, tabId, { groupId })
  yield* removeGroupIfEmpty(tx, tab.groupId, window.id)
})

export const setPinned = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  pinned: boolean,
) {
  const { tab } = yield* requireTab(tx, tabId)
  if (tab.pinned === pinned) return
  if (pinned) yield* assignGroup(tx, tabId, Option.none())
  const { window } = yield* requireTab(tx, tabId)
  const boundary = pinnedCount(window.tabs)
  yield* moveWithinWindow(tx, tabId, pinned ? boundary : boundary - 1)
  yield* updateTab(tx, tabId, (record) => ({ ...record, pinned }))
  yield* emitTabUpdated(tx, tabId, { pinned })
})

export const activateTab = Effect.fnUntraced(function* (tx: BrowsingTx, tabId: TabId) {
  const { window, tab } = yield* requireTab(tx, tabId)
  if (Option.contains(window.activeTabId, tabId)) return
  const state = yield* tx.state
  const collapsedGroup = Option.filter(
    Option.flatMap(tab.groupId, (groupId) => findGroup(state, groupId)),
    (group) => group.collapsed,
  )
  if (Option.isSome(collapsedGroup)) {
    yield* updateGroup(tx, { ...collapsedGroup.value, collapsed: false })
  }
  yield* modify(tx, (state) => markActive(state, window.id, tabId, tx.now))
  yield* tx.emit({ _tag: "TabActivated", tabId, windowId: window.id })
  if (tab.discarded) {
    yield* updateTab(tx, tabId, (record) => ({ ...record, discarded: false, status: "complete" }))
    yield* emitTabUpdated(tx, tabId, { discarded: false, status: "complete" })
  }
})

export interface DetachedTab extends TabLocation {
  readonly wasActive: boolean
}

/** タブをウィンドウから外す。イベントは発火しないので、呼び出し側が抜け方に応じて発火する。 */
export const detachTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
): Effect.fn.Return<DetachedTab, BrowserApiError> {
  const location = yield* requireTab(tx, tabId)
  const { window, tab } = location
  const wasActive = Option.contains(window.activeTabId, tabId)
  // Chrome はタブが抜けると、そのタブに開かれたタブの opener を、抜けたタブの opener に付け替える
  const remaining = window.tabs
    .filter((other) => other.id !== tabId)
    .map((other) =>
      Option.contains(other.openerTabId, tabId)
        ? { ...other, openerTabId: tab.openerTabId }
        : other,
    )
  yield* modify(tx, (state) =>
    replaceWindow(state, {
      ...window,
      tabs: remaining,
      activeTabId: wasActive ? Option.none() : window.activeTabId,
    }),
  )
  return { ...location, wasActive }
})

export const activateSuccessor = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  detached: DetachedTab,
) {
  if (!detached.wasActive) return
  const successor = successorOfActiveTab(yield* tx.state, detached.window.tabs, detached.index)
  if (Option.isSome(successor)) yield* activateTab(tx, successor.value)
})

export const closeWindowIfEmpty = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const state = yield* tx.state
  const window = findWindow(state, windowId)
  if (Option.isNone(window) || window.value.tabs.length > 0) return
  const wasFocused = Option.contains(focusedWindowId(state), windowId)
  const focusOrder = state.focusOrder.filter((id) => id !== windowId)
  yield* tx.setState({
    ...state,
    windows: state.windows.filter(({ id }) => id !== windowId),
    focusOrder,
  })
  yield* tx.emit({ _tag: "WindowRemoved", windowId })
  if (wasFocused) yield* tx.emit({ _tag: "WindowFocusChanged", windowId: Array.head(focusOrder) })
})

export const insertTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  windowId: WindowId,
  index: number,
  tab: TabRecord,
) {
  const window = yield* requireWindow(tx, windowId)
  yield* modify(tx, (state) =>
    replaceWindow(state, { ...window, tabs: insertAt(window.tabs, index, tab) }),
  )
})

export const removeTab = Effect.fnUntraced(function* (tx: BrowsingTx, tabId: TabId) {
  const detached = yield* detachTab(tx, tabId)
  yield* tx.emit({
    _tag: "TabRemoved",
    tabId,
    windowId: detached.window.id,
    isWindowClosing: false,
  })
  yield* removeGroupIfEmpty(tx, detached.tab.groupId, detached.window.id)
  yield* activateSuccessor(tx, detached)
  yield* closeWindowIfEmpty(tx, detached.window.id)
})

/**
 * タブを別のウィンドウへ移す。
 *
 * @param keepGroup - グループごと移すときは `true`。`false` なら元のグループを抜け、移動先で
 *   両隣が同じグループならそのグループに入る。
 */
export const transferTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  windowId: WindowId,
  target: number | "end",
  keepGroup: boolean,
): Effect.fn.Return<number, BrowserApiError> {
  yield* requireWindow(tx, windowId)
  const detached = yield* detachTab(tx, tabId)
  yield* tx.emit({
    _tag: "TabDetached",
    tabId,
    oldWindowId: detached.window.id,
    oldPosition: detached.index,
  })
  if (!keepGroup) yield* removeGroupIfEmpty(tx, detached.tab.groupId, detached.window.id)
  yield* activateSuccessor(tx, detached)
  const { tabs } = yield* requireWindow(tx, windowId)
  const requested = target === "end" || target < 0 || target > tabs.length ? tabs.length : target
  const index = clampInsertion(tabs, requested, false)
  // Chrome は別のウィンドウへ移したタブを、ピン留めも opener も外した状態で差し込む
  yield* insertTab(tx, windowId, index, {
    ...detached.tab,
    pinned: false,
    openerTabId: Option.none(),
    groupId: keepGroup ? detached.tab.groupId : groupEnclosingGap(tabs, index),
  })
  yield* tx.emit({ _tag: "TabAttached", tabId, newWindowId: windowId, newPosition: index })
  yield* closeWindowIfEmpty(tx, detached.window.id)
  return index
})

/** `tabs.move` の 1 タブ分。置いた位置を返す。 */
export const moveTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  target: number | "end",
  windowId: Option.Option<WindowId>,
): Effect.fn.Return<number, BrowserApiError> {
  const location = yield* requireTab(tx, tabId)
  if (Option.isSome(windowId) && windowId.value !== location.window.id) {
    return yield* transferTab(tx, tabId, windowId.value, target, false)
  }
  const { tabs } = location.window
  const requested =
    target === "end" || target < 0 || target >= tabs.length ? tabs.length - 1 : target
  const index = clampMove(tabs, requested, location.tab.pinned)
  if (index === location.index) return index
  yield* moveWithinWindow(tx, tabId, index)
  const moved = yield* requireTab(tx, tabId)
  yield* assignGroup(tx, tabId, groupAfterMove(moved.window.tabs, moved.index))
  return index
})

const moveAndSetGroup = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  index: number,
  groupId: Option.Option<TabGroupId>,
) {
  const { tab } = yield* requireTab(tx, tabId)
  if (Option.isSome(groupId) && tab.pinned) {
    // ピン留めを外すと通常はピン留めの境界へ動くが、グループに入れるときはその場で外してから一度だけ動かす
    yield* updateTab(tx, tabId, (record) => ({ ...record, pinned: false }))
    yield* emitTabUpdated(tx, tabId, { pinned: false })
  }
  yield* moveWithinWindow(tx, tabId, index)
  yield* assignGroup(tx, tabId, groupId)
})

/**
 * 同じウィンドウのタブを `destination`（移動前の並びでの差し込み位置）にまとめて並べ、グループを設定する。
 * `tabIds` はタブストリップの並び順で渡す。
 */
export const moveTabsAndSetGroup = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabIds: ReadonlyArray<TabId>,
  destination: number,
  groupId: Option.Option<TabGroupId>,
) {
  const indexed = yield* Effect.forEach(tabIds, (tabId) =>
    Effect.map(requireTab(tx, tabId), ({ index }) => ({ tabId, index })),
  )
  const movingRight = indexed.filter(({ index }) => index < destination)
  const movingLeft = indexed.filter(({ index }) => index >= destination)
  // 右へ動くタブは右端から、左へ動くタブは左端から動かすと、まだ動かしていないタブの位置がずれない
  yield* Effect.forEach(
    Array.reverse(
      movingRight.map(({ tabId }, i) => ({ tabId, to: destination - movingRight.length + i })),
    ),
    ({ tabId, to }) => moveAndSetGroup(tx, tabId, to, groupId),
    { discard: true },
  )
  yield* Effect.forEach(
    movingLeft,
    ({ tabId }, i) => moveAndSetGroup(tx, tabId, destination + i, groupId),
    { discard: true },
  )
})

export interface NewTab {
  readonly windowId: WindowId
  readonly index: number | "end"
  readonly url: string
  readonly active: boolean
  readonly pinned: boolean
  readonly openerTabId: Option.Option<TabId>
}

/** タブを開く。両隣が同じグループの位置に開いたタブはそのグループに入る。 */
export const createTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  spec: NewTab,
): Effect.fn.Return<TabId, BrowserApiError> {
  const window = yield* requireWindow(tx, spec.windowId)
  const index = clampInsertion(window.tabs, spec.index, spec.pinned)
  const [id, issued] = issueId(yield* tx.state)
  const tabId = TabId.make(id)
  yield* tx.setState(issued)
  yield* insertTab(tx, window.id, index, {
    id: tabId,
    url: Option.some(spec.url),
    title: Option.none(),
    favIconUrl: Option.none(),
    status: "complete",
    pinned: spec.pinned,
    audible: false,
    muted: false,
    discarded: false,
    openerTabId: spec.openerTabId,
    groupId: spec.pinned ? Option.none() : groupEnclosingGap(window.tabs, index),
    lastAccessed: tx.now,
  })
  const becomesActive = spec.active || Option.isNone(window.activeTabId)
  if (becomesActive) yield* modify(tx, (state) => markActive(state, window.id, tabId, tx.now))
  const created = tabSnapshot(yield* tx.state, tabId)
  if (Option.isSome(created)) yield* tx.emit({ _tag: "TabCreated", tab: created.value })
  if (becomesActive) yield* tx.emit({ _tag: "TabActivated", tabId, windowId: window.id })
  return tabId
})

export const focusWindow = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const state = yield* tx.state
  if (Option.contains(focusedWindowId(state), windowId)) return
  yield* tx.setState({
    ...state,
    focusOrder: [windowId, ...state.focusOrder.filter((id) => id !== windowId)],
  })
  yield* tx.emit({ _tag: "WindowFocusChanged", windowId: Option.some(windowId) })
})

/** フォーカスを外し、最近フォーカスされた順で次のウィンドウへ移す。ほかに無ければ何もしない。 */
export const blurWindow = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const state = yield* tx.state
  const others = state.focusOrder.filter((id) => id !== windowId)
  if (!Option.contains(focusedWindowId(state), windowId) || others.length === 0) return
  yield* tx.setState({ ...state, focusOrder: [...others, windowId] })
  yield* tx.emit({ _tag: "WindowFocusChanged", windowId: Array.head(others) })
})
