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
  /** タブストリップの並び順。配列の位置がそのまま Chrome の index になる。 */
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
  /** 作られた順。 */
  readonly windows: ReadonlyArray<WindowRecord>
  /** グループの所属はタブ側の `groupId` で表し、ここには見た目だけを持つ。 */
  readonly groups: ReadonlyArray<GroupRecord>
  /** 最近フォーカスされた順。先頭がフォーカス中のウィンドウ。 */
  readonly focusOrder: ReadonlyArray<WindowId>
  /** タブ・ウィンドウ・グループで共有する採番。種類の違う ID が偶然一致しないようにする。 */
  readonly lastIssuedId: number
}

/** 位置と大きさを指定せずに置いたウィンドウの位置と大きさ。 */
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

/** ウィンドウの作成順、ウィンドウの中ではタブストリップの左から。 */
export const allTabLocations = (state: BrowsingState): ReadonlyArray<TabLocation> =>
  state.windows.flatMap((window) => window.tabs.map((tab, index) => ({ window, index, tab })))

/** ウィンドウの作成順、ウィンドウの中ではタブストリップの左から。 */
export const splitViewMembers = (
  state: BrowsingState,
  splitViewId: SplitViewId,
): ReadonlyArray<TabLocation> =>
  allTabLocations(state).filter(({ tab }) => Option.contains(tab.splitViewId, splitViewId))

export const splitViewIds = (state: BrowsingState): ReadonlyArray<SplitViewId> =>
  Array.dedupe(allTabLocations(state).flatMap(({ tab }) => Option.toArray(tab.splitViewId)))

/** `createSplit` の条件のうち、2 つのタブの並びと状態についての違反。どちらかが分割済みかは見ない。 */
export const splitViewProblems = (a: TabLocation, b: TabLocation): ReadonlyArray<string> => [
  ...(a.window.id === b.window.id ? [] : ["Split tabs must be in the same window."]),
  ...(a.window.id === b.window.id && Math.abs(a.index - b.index) !== 1
    ? ["Split tabs must be adjacent."]
    : []),
  ...(a.tab.pinned === b.tab.pinned ? [] : ["Split tabs must have matching pinned states."]),
  ...(sameGroup(a.tab.groupId, b.tab.groupId) ? [] : ["Split tabs must be in the same group."]),
]

/** 2 つのタブだけが条件を満たして並んでいる分割ビューか。 */
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

/** 新しく差し込むタブの位置を、ピン留めの領域の内か外かに収める。 */
export const clampInsertion = (
  tabs: ReadonlyArray<TabRecord>,
  index: number | "end",
  pinned: boolean,
): number => {
  const boundary = pinnedCount(tabs)
  const [min, max] = pinned ? [0, boundary] : [boundary, tabs.length]
  return index === "end" ? max : clamp(index, min, max)
}

/** 既にあるタブの移動先を、ピン留めの境界を越えない位置に収める。 */
export const clampMove = (
  tabs: ReadonlyArray<TabRecord>,
  index: number,
  pinned: boolean,
): number => {
  const boundary = pinnedCount(tabs)
  return pinned ? clamp(index, 0, boundary - 1) : clamp(index, boundary, tabs.length - 1)
}

/** `gap` の位置（その index のタブの直前）に差し込むと、同じ分割ビューの 2 つのタブの間に入るか。 */
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

/** `gap` の位置（その index のタブの直前）に差し込むタブが属するグループ。両隣が同じグループのときだけ。 */
export const groupEnclosingGap = (
  tabs: ReadonlyArray<TabRecord>,
  gap: number,
): Option.Option<TabGroupId> => {
  const left = groupAt(tabs, gap - 1)
  return sameGroup(left, groupAt(tabs, gap)) ? left : Option.none()
}

/**
 * 移動し終えた `index` のタブが属するべきグループ。
 * 元のグループから離れたら抜け、別のグループの途中に入ったらそのグループに入る。
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

/** `start` の右側を近い順に、次に左側を近い順に探す。 */
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
 * アクティブなタブが `removingIndex` から抜けたあとにアクティブにするタブ。
 *
 * 優先順: そのタブが開いたタブ、同じタブから開かれたタブ、それを開いたタブ、
 * 同じグループの隣のタブ、折りたたまれていない右のタブ、左のタブ。
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
 * 新しいグループの置き場所（その位置に差し込む）。先頭のタブの直後から探し、
 * ピン留めの領域と、先頭のタブが属していたグループの途中を避ける。
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

/** そのウィンドウで使われている数が最も少ない色。同数なら Chrome の色の定義順で先のもの。 */
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

/** ウィンドウの作成順、ウィンドウの中ではタブストリップの左から。 */
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
