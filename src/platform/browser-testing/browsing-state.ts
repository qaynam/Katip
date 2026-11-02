import { Array, Equivalence, Option, pipe } from "effect"
import {
  type BrowserTab,
  type BrowserTabGroup,
  type BrowserWindow,
  type SplitViewId,
  TabGroupColor,
  type TabGroupId,
  type TabId,
  type TabStatus,
  type WindowBounds,
  type WindowId,
} from "#platform/browser"

export interface TabRecord {
  readonly id: TabId
  readonly url: Option.Option<string>
  readonly title: Option.Option<string>
  readonly favIconUrl: Option.Option<string>
  readonly status: TabStatus
  readonly pinned: boolean
  readonly audible: boolean
  readonly muted: boolean
  readonly discarded: boolean
  readonly openerTabId: Option.Option<TabId>
  readonly groupId: Option.Option<TabGroupId>
  readonly splitViewId: Option.Option<SplitViewId>
  readonly lastAccessed: number
}

export interface WindowRecord {
  readonly id: WindowId
  readonly type: "normal" | "popup"
  readonly bounds: WindowBounds
  /** In tab strip order; a tab's position in the array is its Chrome index. */
  readonly tabs: ReadonlyArray<TabRecord>
  readonly activeTabId: Option.Option<TabId>
}

export interface GroupRecord {
  readonly id: TabGroupId
  readonly title: Option.Option<string>
  readonly color: TabGroupColor
  readonly collapsed: boolean
}

export interface BrowsingState {
  /** In creation order. */
  readonly windows: ReadonlyArray<WindowRecord>
  /** Only the groups' appearance; membership lives in each tab's `groupId`. */
  readonly groups: ReadonlyArray<GroupRecord>
  /** Most recently focused first; the head is the focused window. */
  readonly focusOrder: ReadonlyArray<WindowId>
  /**
   * One counter shared by tabs, windows and groups, so IDs of different kinds never coincide by
   * accident.
   */
  readonly lastIssuedId: number
}

/** The bounds of a window placed without a position and size. */
export const DEFAULT_WINDOW_BOUNDS: WindowBounds = { left: 0, top: 0, width: 1280, height: 800 }

export const emptyBrowsingState: BrowsingState = {
  windows: [],
  groups: [],
  focusOrder: [],
  lastIssuedId: 0,
}

export const sameGroup = Option.makeEquivalence(Equivalence.strictEqual<TabGroupId>())

export const issueId = (state: BrowsingState): readonly [number, BrowsingState] => {
  const id = state.lastIssuedId + 1
  return [id, { ...state, lastIssuedId: id }]
}

export const findWindow = (state: BrowsingState, windowId: WindowId): Option.Option<WindowRecord> =>
  Array.findFirst(state.windows, (window) => window.id === windowId)

export const findGroup = (state: BrowsingState, groupId: TabGroupId): Option.Option<GroupRecord> =>
  Array.findFirst(state.groups, (group) => group.id === groupId)

export const focusedWindowId = (state: BrowsingState): Option.Option<WindowId> =>
  Array.head(state.focusOrder)

export interface TabLocation {
  readonly window: WindowRecord
  readonly index: number
  readonly tab: TabRecord
}

export const locateTab = (state: BrowsingState, tabId: TabId): Option.Option<TabLocation> =>
  Array.findFirst(state.windows, (window) =>
    Option.map(
      Array.findFirstWithIndex(window.tabs, (tab) => tab.id === tabId),
      ([tab, index]) => ({ window, index, tab }),
    ),
  )

/** In window creation order, and left to right within each tab strip. */
export const allTabLocations = (state: BrowsingState): ReadonlyArray<TabLocation> =>
  state.windows.flatMap((window) => window.tabs.map((tab, index) => ({ window, index, tab })))

/** In window creation order, and left to right within each tab strip. */
export const splitViewMembers = (
  state: BrowsingState,
  splitViewId: SplitViewId,
): ReadonlyArray<TabLocation> =>
  allTabLocations(state).filter(({ tab }) => Option.contains(tab.splitViewId, splitViewId))

export const splitViewIds = (state: BrowsingState): ReadonlyArray<SplitViewId> =>
  Array.dedupe(allTabLocations(state).flatMap(({ tab }) => Option.toArray(tab.splitViewId)))

/**
 * The `createSplit` conditions on the two tabs' placement and state that are violated. Whether
 * either tab is already split is not checked here.
 */
export const splitViewProblems = (a: TabLocation, b: TabLocation): ReadonlyArray<string> => [
  ...(a.window.id === b.window.id ? [] : ["Split tabs must be in the same window."]),
  ...(a.window.id === b.window.id && Math.abs(a.index - b.index) !== 1
    ? ["Split tabs must be adjacent."]
    : []),
  ...(a.tab.pinned === b.tab.pinned ? [] : ["Split tabs must have matching pinned states."]),
  ...(sameGroup(a.tab.groupId, b.tab.groupId) ? [] : ["Split tabs must be in the same group."]),
]

/** Whether the split view has exactly two tabs placed as its conditions require. */
export const isIntactSplitView = (members: ReadonlyArray<TabLocation>): boolean => {
  const [first, second, ...rest] = members
  return (
    first !== undefined &&
    second !== undefined &&
    rest.length === 0 &&
    splitViewProblems(first, second).length === 0
  )
}

export const replaceWindow = (state: BrowsingState, window: WindowRecord): BrowsingState => ({
  ...state,
  windows: state.windows.map((existing) => (existing.id === window.id ? window : existing)),
})

export const updateTabRecord = (
  state: BrowsingState,
  tabId: TabId,
  update: (tab: TabRecord) => TabRecord,
): BrowsingState => ({
  ...state,
  windows: state.windows.map((window) => ({
    ...window,
    tabs: window.tabs.map((tab) => (tab.id === tabId ? update(tab) : tab)),
  })),
})

export const markActive = (
  state: BrowsingState,
  windowId: WindowId,
  tabId: TabId,
  now: number,
): BrowsingState =>
  updateTabRecord(
    {
      ...state,
      windows: state.windows.map((window) =>
        window.id === windowId ? { ...window, activeTabId: Option.some(tabId) } : window,
      ),
    },
    tabId,
    (tab) => ({ ...tab, lastAccessed: now }),
  )

export const replaceGroup = (state: BrowsingState, group: GroupRecord): BrowsingState => ({
  ...state,
  groups: state.groups.map((existing) => (existing.id === group.id ? group : existing)),
})

export const relocate = <A>(
  items: ReadonlyArray<A>,
  from: number,
  to: number,
): ReadonlyArray<A> => {
  const moving = items.slice(from, from + 1)
  const rest = items.filter((_, index) => index !== from)
  return [...rest.slice(0, to), ...moving, ...rest.slice(to)]
}

export const insertAt = <A>(items: ReadonlyArray<A>, index: number, item: A): ReadonlyArray<A> => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export const pinnedCount = (tabs: ReadonlyArray<TabRecord>): number =>
  tabs.filter((tab) => tab.pinned).length

/** Clamps where a new tab is inserted to inside or outside the pinned area, as fits the tab. */
export const clampInsertion = (
  tabs: ReadonlyArray<TabRecord>,
  index: number | "end",
  pinned: boolean,
): number => {
  const boundary = pinnedCount(tabs)
  const [min, max] = pinned ? [0, boundary] : [boundary, tabs.length]
  return index === "end" ? max : clamp(index, min, max)
}

/** Clamps where an existing tab moves to so it does not cross the pinned boundary. */
export const clampMove = (
  tabs: ReadonlyArray<TabRecord>,
  index: number,
  pinned: boolean,
): number => {
  const boundary = pinnedCount(tabs)
  return pinned ? clamp(index, 0, boundary - 1) : clamp(index, boundary, tabs.length - 1)
}

/** Whether inserting at `gap` (right before the tab at that index) would land between the two tabs of a split view. */
export const splitsGap = (tabs: ReadonlyArray<TabRecord>, gap: number): boolean => {
  const left = Option.flatMap(Array.get(tabs, gap - 1), (tab) => tab.splitViewId)
  return (
    Option.isSome(left) &&
    Option.contains(
      Option.flatMap(Array.get(tabs, gap), (tab) => tab.splitViewId),
      left.value,
    )
  )
}

export const groupAt = (tabs: ReadonlyArray<TabRecord>, index: number): Option.Option<TabGroupId> =>
  Option.flatMap(Array.get(tabs, index), (tab) => tab.groupId)

/**
 * The group a tab inserted at `gap` (just before the tab at that index) joins; only when both
 * neighbors are in the same group.
 */
export const groupEnclosingGap = (
  tabs: ReadonlyArray<TabRecord>,
  gap: number,
): Option.Option<TabGroupId> => {
  const left = groupAt(tabs, gap - 1)
  return sameGroup(left, groupAt(tabs, gap)) ? left : Option.none()
}

/**
 * The group the tab at `index` belongs in after its move: it leaves its group when moved away from
 * it, and joins another group when it lands inside one.
 */
export const groupAfterMove = (
  tabs: ReadonlyArray<TabRecord>,
  index: number,
): Option.Option<TabGroupId> => {
  const own = groupAt(tabs, index)
  const left = groupAt(tabs, index - 1)
  const right = groupAt(tabs, index + 1)
  if (sameGroup(own, left) || sameGroup(own, right)) return own
  if (Option.isSome(left) && sameGroup(left, right)) return left
  const ownHasOtherMembers = Option.exists(own, (groupId) =>
    tabs.some((tab, i) => i !== index && Option.contains(tab.groupId, groupId)),
  )
  return ownHasOtherMembers ? Option.none() : own
}

/** Searches outward from `start`: first to its right, nearest first, then to its left. */
export const searchAround = (
  tabs: ReadonlyArray<TabRecord>,
  start: number,
  predicate: (tab: TabRecord) => boolean,
): Option.Option<TabRecord> => {
  const right = tabs.slice(start + 1)
  const left = Array.reverse(tabs.slice(0, Math.max(start, 0)))
  return Array.findFirst([...right, ...left], predicate)
}

const isInCollapsedGroup = (state: BrowsingState) => (tab: TabRecord) =>
  Option.exists(tab.groupId, (groupId) =>
    Option.exists(findGroup(state, groupId), (group) => group.collapsed),
  )

/**
 * The tab to activate once the active tab leaves `removingIndex`.
 *
 * In priority order: a tab it opened, a tab opened by the same opener, its opener, the adjacent tab
 * in the same group, then the nearest tab outside collapsed groups, right before left.
 */
export const successorOfActiveTab = (
  state: BrowsingState,
  tabsBeforeRemoval: ReadonlyArray<TabRecord>,
  removingIndex: number,
): Option.Option<TabId> =>
  Option.flatMap(Array.get(tabsBeforeRemoval, removingIndex), (closing) => {
    const collapsed = isInCollapsedGroup(state)
    const isCandidate = (tab: TabRecord) => tab.id !== closing.id && !collapsed(tab)
    const openedBy = (openerId: TabId) => (tab: TabRecord) =>
      isCandidate(tab) && Option.contains(tab.openerTabId, openerId)
    const childOfClosing = () =>
      searchAround(tabsBeforeRemoval, removingIndex, openedBy(closing.id))
    const siblingOrOpener = () =>
      Option.flatMap(closing.openerTabId, (openerId) =>
        pipe(
          searchAround(tabsBeforeRemoval, removingIndex, openedBy(openerId)),
          Option.orElse(() =>
            Array.findFirst(tabsBeforeRemoval, (tab) => tab.id === openerId && isCandidate(tab)),
          ),
        ),
      )
    const neighborInSameGroup = () =>
      Option.flatMap(closing.groupId, (groupId) =>
        Array.findFirst([removingIndex + 1, removingIndex - 1], (index) =>
          Option.filter(Array.get(tabsBeforeRemoval, index), (tab) =>
            Option.contains(tab.groupId, groupId),
          ),
        ),
      )
    return pipe(
      childOfClosing(),
      Option.orElse(siblingOrOpener),
      Option.orElse(neighborInSameGroup),
      Option.orElse(() => searchAround(tabsBeforeRemoval, removingIndex, isCandidate)),
      Option.orElse(() =>
        searchAround(tabsBeforeRemoval, removingIndex, (tab) => tab.id !== closing.id),
      ),
      Option.map((tab) => tab.id),
    )
  })

/**
 * Where to insert a new group. Searches from just after the first tab, avoiding the pinned area and
 * the inside of the group the first tab was in.
 */
export const newGroupDestination = (tabs: ReadonlyArray<TabRecord>, firstIndex: number): number => {
  const firstGroup = groupAt(tabs, firstIndex)
  return Option.getOrElse(
    Array.findFirstIndex(
      tabs,
      (tab, index) =>
        index > firstIndex &&
        !tab.pinned &&
        !(Option.isSome(tab.groupId) && sameGroup(tab.groupId, firstGroup)),
    ),
    () => tabs.length,
  )
}

/** The color least used in the window; ties go to the one Chrome defines first. */
export const leastUsedColor = (colorsInUse: ReadonlyArray<TabGroupColor>): TabGroupColor => {
  const usage = (color: TabGroupColor) => colorsInUse.filter((used) => used === color).length
  return TabGroupColor.literals.reduce((best, color) => (usage(color) < usage(best) ? color : best))
}

export const groupIdsInWindow = (window: WindowRecord): ReadonlyArray<TabGroupId> =>
  Array.dedupe(window.tabs.flatMap((tab) => Option.toArray(tab.groupId)))

export const windowOfGroup = (
  state: BrowsingState,
  groupId: TabGroupId,
): Option.Option<WindowRecord> =>
  Array.findFirst(state.windows, (window) =>
    window.tabs.some((tab) => Option.contains(tab.groupId, groupId)),
  )

export const toBrowserTab = (window: WindowRecord, index: number, tab: TabRecord): BrowserTab => ({
  id: tab.id,
  windowId: window.id,
  index,
  url: tab.url,
  pendingUrl: Option.none(),
  title: tab.title,
  favIconUrl: tab.favIconUrl,
  status: Option.some(tab.status),
  active: Option.contains(window.activeTabId, tab.id),
  pinned: tab.pinned,
  audible: tab.audible,
  muted: tab.muted,
  discarded: tab.discarded,
  incognito: false,
  openerTabId: tab.openerTabId,
  groupId: tab.groupId,
  splitViewId: tab.splitViewId,
  lastAccessed: Option.some(tab.lastAccessed),
})

export const tabSnapshot = (state: BrowsingState, tabId: TabId): Option.Option<BrowserTab> =>
  Option.map(locateTab(state, tabId), ({ window, index, tab }) => toBrowserTab(window, index, tab))

export const allTabs = (state: BrowsingState): ReadonlyArray<BrowserTab> =>
  allTabLocations(state).map(({ window, index, tab }) => toBrowserTab(window, index, tab))

export const toBrowserTabGroup = (group: GroupRecord, windowId: WindowId): BrowserTabGroup => ({
  id: group.id,
  windowId,
  title: group.title,
  color: group.color,
  collapsed: group.collapsed,
})

export const groupSnapshot = (
  state: BrowsingState,
  groupId: TabGroupId,
): Option.Option<BrowserTabGroup> =>
  Option.flatMap(findGroup(state, groupId), (group) =>
    Option.map(windowOfGroup(state, groupId), (window) => toBrowserTabGroup(group, window.id)),
  )

/** In window creation order, and left to right within each tab strip. */
export const allGroups = (state: BrowsingState): ReadonlyArray<BrowserTabGroup> =>
  state.windows.flatMap((window) =>
    groupIdsInWindow(window).flatMap((groupId) =>
      Option.toArray(findGroup(state, groupId)).map((group) => toBrowserTabGroup(group, window.id)),
    ),
  )

export const toBrowserWindow = (state: BrowsingState, window: WindowRecord): BrowserWindow => ({
  id: window.id,
  focused: Option.contains(focusedWindowId(state), window.id),
  type: Option.some(window.type),
  state: Option.some("normal"),
  incognito: false,
  bounds: Option.some(window.bounds),
})
