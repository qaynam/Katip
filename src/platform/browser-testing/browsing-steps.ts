import { Array, Effect, Option, Order } from "effect"
import {
  type BrowserApiError,
  SplitViewId,
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
  isIntactSplitView,
  issueId,
  locateTab,
  markActive,
  pinnedCount,
  relocate,
  replaceGroup,
  replaceWindow,
  sameGroup,
  splitViewIds,
  splitViewMembers,
  splitsGap,
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

/**
 * Removes a group whose last tab has left. `windowId` is the window the group was in just before.
 */
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
  yield* leaveSplitView(tx, tabId)
  const { window } = yield* requireTab(tx, tabId)
  const boundary = pinnedCount(window.tabs)
  yield* updateTab(tx, tabId, (record) => ({ ...record, pinned }))
  yield* emitTabUpdated(tx, tabId, { pinned })
  if (pinned) yield* assignGroup(tx, tabId, Option.none())
  yield* moveWithinWindow(tx, tabId, pinned ? boundary : boundary - 1)
})

export const leaveSplitView = Effect.fnUntraced(function* (tx: BrowsingTx, tabId: TabId) {
  const { tab } = yield* requireTab(tx, tabId)
  if (Option.isSome(tab.splitViewId)) yield* unsplitTabs(tx, tab.splitViewId.value)
})

/** Before a tab leaves its window, Chrome releases its split view, pinning and group in this order, emitting each change. */
export const releaseTab = Effect.fnUntraced(function* (tx: BrowsingTx, tabId: TabId) {
  yield* leaveSplitView(tx, tabId)
  const { tab } = yield* requireTab(tx, tabId)
  if (tab.pinned) {
    yield* updateTab(tx, tabId, (record) => ({ ...record, pinned: false }))
    yield* emitTabUpdated(tx, tabId, { pinned: false })
  }
  yield* assignGroup(tx, tabId, Option.none())
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

/**
 * Takes a tab out of its window without emitting events; the caller emits whichever events fit how
 * the tab left.
 */
export const detachTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
): Effect.fn.Return<DetachedTab, BrowserApiError> {
  const location = yield* requireTab(tx, tabId)
  const { window, tab } = location
  const wasActive = Option.contains(window.activeTabId, tabId)
  // When a tab leaves, Chrome hands the tabs it opened over to its own opener
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

/** @param departed - Where the departed tab was, and its state before its split, pinning and group were released. */
export const activateSuccessor = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  departed: DetachedTab,
) {
  if (!departed.wasActive) return
  const successor = successorOfActiveTab(yield* tx.state, departed.window.tabs, departed.index)
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
  const before = yield* requireTab(tx, tabId)
  yield* releaseTab(tx, tabId)
  const detached = yield* detachTab(tx, tabId)
  yield* tx.emit({
    _tag: "TabRemoved",
    tabId,
    windowId: detached.window.id,
    isWindowClosing: false,
  })
  yield* activateSuccessor(tx, { ...before, wasActive: detached.wasActive })
  yield* closeWindowIfEmpty(tx, detached.window.id)
})

/**
 * Moves a tab to another window.
 *
 * @param keepGroup - `true` when moving with the whole group. When `false`, the tab releases its
 *   split, pinning and group before leaving, and joins a group at the destination only when both
 *   neighbors are in it.
 */
export const transferTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  windowId: WindowId,
  target: number | "end",
  keepGroup: boolean,
): Effect.fn.Return<number, BrowserApiError> {
  yield* requireWindow(tx, windowId)
  const before = yield* requireTab(tx, tabId)
  if (!keepGroup) yield* releaseTab(tx, tabId)
  const detached = yield* detachTab(tx, tabId)
  yield* tx.emit({
    _tag: "TabDetached",
    tabId,
    oldWindowId: detached.window.id,
    oldPosition: detached.index,
  })
  yield* activateSuccessor(tx, { ...before, wasActive: detached.wasActive })
  const { tabs } = yield* requireWindow(tx, windowId)
  const requested = target === "end" || target < 0 || target > tabs.length ? tabs.length : target
  const index = clampInsertion(tabs, requested, false)
  // Chrome attaches a tab moved to another window without its opener
  yield* insertTab(tx, windowId, index, {
    ...detached.tab,
    openerTabId: Option.none(),
    groupId: keepGroup ? detached.tab.groupId : groupEnclosingGap(tabs, index),
  })
  yield* tx.emit({ _tag: "TabAttached", tabId, newWindowId: windowId, newPosition: index })
  yield* closeWindowIfEmpty(tx, detached.window.id)
  return index
})

/** One tab's share of `tabs.move`; returns where the tab was placed. */
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
  // Moving both tabs together looks like it could keep the split, but Chrome dissolves it before the first move
  yield* leaveSplitView(tx, tabId)
  yield* unsplitSeparatedBy(tx, tabId, index)
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
    // Not moved to the pinned boundary as unpinning usually does: when grouping, the tab is
    // unpinned in place and then moved just once
    yield* updateTab(tx, tabId, (record) => ({ ...record, pinned: false }))
    yield* emitTabUpdated(tx, tabId, { pinned: false })
  }
  yield* moveWithinWindow(tx, tabId, index)
  yield* assignGroup(tx, tabId, groupId)
})

/**
 * Gathers tabs of one window at `destination` (the insertion point in the order before the move)
 * and sets their group. Pass `tabIds` in tab strip order.
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
  // Tabs moving right go from the rightmost and tabs moving left from the leftmost, so tabs not yet
  // moved keep their positions
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
  /** Omitted, the tab joins a group only when opened between two tabs of that group. */
  readonly groupId?: Option.Option<TabGroupId>
}

export const createTab = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  spec: NewTab,
): Effect.fn.Return<TabId, BrowserApiError> {
  const window = yield* requireWindow(tx, spec.windowId)
  const clamped = clampInsertion(window.tabs, spec.index, spec.pinned)
  // Not inserted at the requested index: Chrome never opens a tab between a split, only to its right
  const index = splitsGap(window.tabs, clamped) ? clamped + 1 : clamped
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
    groupId: spec.groupId ?? (spec.pinned ? Option.none() : groupEnclosingGap(window.tabs, index)),
    splitViewId: Option.none(),
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

/**
 * Moves focus away to the next most recently focused window; does nothing when there is no other.
 */
export const blurWindow = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const state = yield* tx.state
  const others = state.focusOrder.filter((id) => id !== windowId)
  if (!Option.contains(focusedWindowId(state), windowId) || others.length === 0) return
  yield* tx.setState({ ...state, focusOrder: [...others, windowId] })
  yield* tx.emit({ _tag: "WindowFocusChanged", windowId: Array.head(others) })
})

const setSplitViewId = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  splitViewId: Option.Option<SplitViewId>,
) {
  yield* updateTab(tx, tabId, (record) => ({ ...record, splitViewId }))
  yield* emitTabUpdated(tx, tabId, { splitViewId })
})

/**
 * Splits two tabs without checking the conditions; the changes are emitted in tab strip order.
 */
export const splitTabs = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabIds: readonly [TabId, TabId],
): Effect.fn.Return<SplitViewId, BrowserApiError> {
  const [id, issued] = issueId(yield* tx.state)
  const splitViewId = SplitViewId.make(id)
  yield* tx.setState(issued)
  const members = yield* Effect.forEach(tabIds, (tabId) => requireTab(tx, tabId))
  const inStripOrder = Array.sort(
    members,
    Order.mapInput(Order.Number, ({ index }: TabLocation) => index),
  )
  yield* Effect.forEach(
    inStripOrder,
    ({ tab }) => setSplitViewId(tx, tab.id, Option.some(splitViewId)),
    { discard: true },
  )
  return splitViewId
})

/** Dissolves the splits that moving `tabId` to `toIndex` would wedge apart. */
const unsplitSeparatedBy = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
  toIndex: number,
) {
  const { window, index } = yield* requireTab(tx, tabId)
  const relocated = relocate(window.tabs, index, toIndex)
  const separated = Array.dedupe(
    relocated.flatMap((tab) => Option.toArray(tab.splitViewId)),
  ).filter((splitViewId) => {
    const positions = relocated.flatMap((tab, position) =>
      Option.contains(tab.splitViewId, splitViewId) ? [position] : [],
    )
    const [first, second] = positions
    return first !== undefined && second !== undefined && second - first !== 1
  })
  yield* Effect.forEach(separated, (splitViewId) => unsplitTabs(tx, splitViewId), {
    discard: true,
  })
})

export const unsplitTabs = Effect.fnUntraced(function* (tx: BrowsingTx, splitViewId: SplitViewId) {
  yield* Effect.forEach(
    splitViewMembers(yield* tx.state, splitViewId),
    ({ tab }) => setSplitViewId(tx, tab.id, Option.none()),
    { discard: true },
  )
})

/**
 * Dissolves split views that no longer meet their conditions: two adjacent tabs in the same window,
 * with the same pinning and group.
 *
 * @remarks
 * The operations observed to dissolve a split before they run (moving one or both tabs, moving
 * another tab between them, changing pinning, closing, duplicating, moving to another window)
 * dissolve it in their own steps first. This only dissolves splits left invalid by other operations.
 */
export const dissolveBrokenSplitViews = Effect.fnUntraced(function* (tx: BrowsingTx) {
  const state = yield* tx.state
  const broken = splitViewIds(state).filter(
    (splitViewId) => !isIntactSplitView(splitViewMembers(state, splitViewId)),
  )
  yield* Effect.forEach(broken, (splitViewId) => unsplitTabs(tx, splitViewId), { discard: true })
})
