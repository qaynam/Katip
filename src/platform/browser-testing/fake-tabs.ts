import { Array, Effect, Option, Order, Ref } from "effect"
import {
  type BrowserApiError,
  type BrowserTab,
  type TabCreateOptions,
  TabGroupId,
  type TabId,
  type TabQuery,
  Tabs,
  type WindowId,
} from "#platform/browser"
import {
  allTabs,
  type BrowsingState,
  findGroup,
  focusedWindowId,
  groupIdsInWindow,
  issueId,
  leastUsedColor,
  locateTab,
  newGroupDestination,
  sameGroup,
  splitViewMembers,
  splitViewProblems,
  tabSnapshot,
  toBrowserTabGroup,
  windowOfGroup,
} from "./browsing-state"
import {
  activateTab,
  createTab,
  emitTabUpdated,
  moveTab,
  moveTabsAndSetGroup,
  NEW_TAB_URL,
  removeTab,
  requireFocusedWindow,
  requireGroup,
  requireTab,
  requireWindow,
  setPinned,
  splitTabs,
  transferTab,
  unsplitTabs,
  updateTab,
} from "./browsing-steps"
import { type BrowsingTx, chromeCall, type FakeWorld, transact } from "./fake-world"

const unspecifiedOr = <A>(expected: A | undefined, actual: A) =>
  expected === undefined || expected === actual

const matchesTabQuery = (state: BrowsingState, query: TabQuery) => (tab: BrowserTab) =>
  unspecifiedOr(query.windowId, tab.windowId) &&
  unspecifiedOr(query.lastFocusedWindow, Option.contains(focusedWindowId(state), tab.windowId)) &&
  unspecifiedOr(query.active, tab.active) &&
  unspecifiedOr(query.pinned, tab.pinned) &&
  unspecifiedOr(query.audible, tab.audible) &&
  unspecifiedOr(query.discarded, tab.discarded) &&
  (query.groupId === undefined || sameGroup(query.groupId, tab.groupId))

export const requireTabSnapshot = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  tabId: TabId,
): Effect.fn.Return<BrowserTab, BrowserApiError> {
  const tab = tabSnapshot(yield* tx.state, tabId)
  if (Option.isNone(tab)) return yield* tx.reject(`No tab with id: ${tabId}.`)
  return tab.value
})

const createGroup = Effect.fnUntraced(function* (tx: BrowsingTx, windowId: WindowId) {
  const window = yield* requireWindow(tx, windowId)
  const [id, issued] = issueId(yield* tx.state)
  const colorsInUse = groupIdsInWindow(window).flatMap((groupId) =>
    Option.toArray(findGroup(issued, groupId)).map(({ color }) => color),
  )
  const group = {
    id: TabGroupId.make(id),
    title: Option.none(),
    color: leastUsedColor(colorsInUse),
    collapsed: false,
  }
  yield* tx.setState({ ...issued, groups: [...issued.groups, group] })
  yield* tx.emit({ _tag: "TabGroupCreated", group: toBrowserTabGroup(group, windowId) })
  return group.id
})

const windowOfExistingGroup = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  groupId: TabGroupId,
): Effect.fn.Return<WindowId, BrowserApiError> {
  yield* requireGroup(tx, groupId)
  const window = windowOfGroup(yield* tx.state, groupId)
  if (Option.isNone(window)) return yield* tx.reject(`No group with id: ${groupId}.`)
  return window.value.id
})

/**
 * グループの左半分にあるタブはグループの左へ、右半分にあるタブは右へ出す。
 * グループの途中でタブを抜くと、グループが 2 つに分かれてしまうため。
 */
const ungroupFrom = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  groupId: TabGroupId,
  tabIds: ReadonlyArray<TabId>,
) {
  const window = windowOfGroup(yield* tx.state, groupId)
  if (Option.isNone(window)) return
  const indexed = window.value.tabs.map((tab, index) => ({ tab, index }))
  const memberIndices = indexed
    .filter(({ tab }) => Option.contains(tab.groupId, groupId))
    .map(({ index }) => index)
  const first = Option.getOrElse(Array.head(memberIndices), () => 0)
  const last = Option.getOrElse(Array.last(memberIndices), () => 0)
  const half = Math.floor((last - first + 1) / 2)
  const targets = indexed.filter(({ tab }) => tabIds.includes(tab.id))
  yield* moveTabsAndSetGroup(
    tx,
    targets.filter(({ index }) => index - first < half).map(({ tab }) => tab.id),
    first,
    Option.none(),
  )
  yield* moveTabsAndSetGroup(
    tx,
    targets.filter(({ index }) => index - first >= half).map(({ tab }) => tab.id),
    last + 1,
    Option.none(),
  )
})

const requireOpenerIn = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  openerTabId: TabId | undefined,
  windowId: WindowId,
) {
  if (openerTabId === undefined) return
  const opener = yield* requireTab(tx, openerTabId)
  if (opener.window.id !== windowId) {
    return yield* tx.reject("Tab opener must be in the same window as the created tab.")
  }
})

const createSplitWith = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  partnerId: TabId,
  options: TabCreateOptions,
) {
  const partner = yield* requireTab(tx, partnerId)
  if (Option.isSome(partner.tab.splitViewId)) {
    return yield* tx.reject("The split-with tab is already in a split view.")
  }
  if (options.windowId !== undefined && options.windowId !== partner.window.id) {
    return yield* tx.reject("The split-with tab must be in the same window as the created tab.")
  }
  const index = options.index ?? partner.index + 1
  if (index !== partner.index && index !== partner.index + 1) {
    return yield* tx.reject("The index must be adjacent to the split-with tab.")
  }
  // Chrome が食い違うピン留めをどちらに揃えるのか確かめられないので、黙って片方に揃えずに失敗させる
  if (options.pinned !== undefined && options.pinned !== partner.tab.pinned) {
    return yield* tx.reject("Split tabs must have matching pinned states.")
  }
  yield* requireOpenerIn(tx, options.openerTabId, partner.window.id)
  const tabId = yield* createTab(tx, {
    windowId: partner.window.id,
    index,
    url: options.url ?? NEW_TAB_URL,
    active: options.active ?? true,
    pinned: partner.tab.pinned,
    openerTabId: Option.fromUndefinedOr(options.openerTabId),
    groupId: partner.tab.groupId,
  })
  yield* splitTabs(tx, [partnerId, tabId])
  return tabId
})

const areSplitPartners = (state: BrowsingState, a: TabId, b: TabId) => {
  const splitViewOf = (tabId: TabId) =>
    Option.flatMap(locateTab(state, tabId), ({ tab }) => tab.splitViewId)
  return Option.exists(splitViewOf(a), (splitViewId) =>
    Option.contains(splitViewOf(b), splitViewId),
  )
}

/**
 * `tabs.move` の 1 回の操作で動かすタブのまとまり。続けて指定された分割ビューの 2 つのタブを 1 つにまとめる。
 *
 * @remarks
 * 両方を一緒に動かしても分割が残るのは推測。1 タブずつ別の操作にすると、先に動かしたタブが
 * 隣から離れた時点で分割が解けてしまうので、まとめて動かしてから条件を判定させる。
 */
const moveUnits = (
  state: BrowsingState,
  tabIds: ReadonlyArray<TabId>,
): ReadonlyArray<Array.NonEmptyReadonlyArray<TabId>> =>
  tabIds.reduce<ReadonlyArray<Array.NonEmptyReadonlyArray<TabId>>>(
    (units, tabId) =>
      Option.match(
        Option.filter(
          Array.last(units),
          (unit) => unit.length === 1 && areSplitPartners(state, unit[0], tabId),
        ),
        {
          onNone: () => [...units, [tabId]],
          onSome: (single) => [...units.slice(0, -1), [...single, tabId]],
        },
      ),
    [],
  )

export interface FakeTabsOptions {
  readonly supportsSplitView: boolean
}

export const makeFakeTabs = (
  world: FakeWorld,
  { supportsSplitView }: FakeTabsOptions,
): Tabs["Service"] => {
  const requireSplitViewApi = (tx: BrowsingTx) =>
    supportsSplitView ? Effect.void : tx.reject("Split View API requires Chrome 155 or later")

  return Tabs.of({
    query: (query) =>
      chromeCall(
        world,
        "tabs.query",
        Effect.map(Ref.get(world.browsing), (state) =>
          allTabs(state).filter(matchesTabQuery(state, query)),
        ),
      ),

    get: (tabId) => transact(world, "tabs.get", (tx) => requireTabSnapshot(tx, tabId)),

    create: (options) =>
      transact(
        world,
        "tabs.create",
        Effect.fnUntraced(function* (tx) {
          if (options.splitWithTabId !== undefined) {
            yield* requireSplitViewApi(tx)
            const tabId = yield* createSplitWith(tx, options.splitWithTabId, options)
            return yield* requireTabSnapshot(tx, tabId)
          }
          const windowId = options.windowId ?? (yield* requireFocusedWindow(tx))
          yield* requireOpenerIn(tx, options.openerTabId, windowId)
          const tabId = yield* createTab(tx, {
            windowId,
            index: options.index ?? "end",
            url: options.url ?? NEW_TAB_URL,
            active: options.active ?? true,
            pinned: options.pinned ?? false,
            openerTabId: Option.fromUndefinedOr(options.openerTabId),
          })
          return yield* requireTabSnapshot(tx, tabId)
        }),
      ),

    update: (tabId, options) =>
      transact(
        world,
        "tabs.update",
        Effect.fnUntraced(function* (tx) {
          const { tab } = yield* requireTab(tx, tabId)
          if (options.url !== undefined && !Option.contains(tab.url, options.url)) {
            const url = options.url
            yield* updateTab(tx, tabId, (record) => ({ ...record, url: Option.some(url) }))
            yield* emitTabUpdated(tx, tabId, { url })
          }
          if (options.active === true) yield* activateTab(tx, tabId)
          if (options.pinned !== undefined) yield* setPinned(tx, tabId, options.pinned)
          if (options.muted !== undefined && options.muted !== tab.muted) {
            const muted = options.muted
            yield* updateTab(tx, tabId, (record) => ({ ...record, muted }))
            yield* emitTabUpdated(tx, tabId, { muted })
          }
          return yield* requireTabSnapshot(tx, tabId)
        }),
      ),

    remove: (tabIds) =>
      Effect.forEach(
        tabIds,
        (tabId) => transact(world, "tabs.remove", (tx) => removeTab(tx, tabId)),
        { discard: true },
      ),

    move: (tabIds, options) =>
      Effect.gen(function* () {
        const windowId = Option.fromUndefinedOr(options.windowId)
        yield* Effect.reduce(
          moveUnits(yield* Ref.get(world.browsing), tabIds),
          (): number | "end" => options.index,
          (unitTarget, unit) =>
            transact(world, "tabs.move", (tx) =>
              Effect.reduce(
                unit,
                () => unitTarget,
                (target, tabId) =>
                  Effect.map(moveTab(tx, tabId, target, windowId), (placed) => placed + 1),
              ),
            ),
        )
        const state = yield* Ref.get(world.browsing)
        return Array.getSomes(tabIds.map((tabId) => tabSnapshot(state, tabId)))
      }),

    group: (options) =>
      transact(
        world,
        "tabs.group",
        Effect.fnUntraced(function* (tx) {
          const tabIds = Array.dedupe(options.tabIds)
          yield* Effect.forEach(tabIds, (tabId) => requireTab(tx, tabId), { discard: true })
          const windowId =
            options.groupId === undefined
              ? (options.windowId ?? (yield* requireFocusedWindow(tx)))
              : yield* windowOfExistingGroup(tx, options.groupId)
          yield* requireWindow(tx, windowId)
          yield* Effect.forEach(
            tabIds,
            Effect.fnUntraced(function* (tabId) {
              const { window } = yield* requireTab(tx, tabId)
              if (window.id !== windowId) yield* transferTab(tx, tabId, windowId, "end", false)
            }),
            { discard: true },
          )
          const groupId = options.groupId ?? (yield* createGroup(tx, windowId))
          const { tabs } = yield* requireWindow(tx, windowId)
          const joining = tabs
            .map((tab, index) => ({ tab, index }))
            .filter(({ tab }) => tabIds.includes(tab.id) && !Option.contains(tab.groupId, groupId))
          const destination =
            options.groupId === undefined
              ? newGroupDestination(
                  tabs,
                  Option.getOrElse(Array.head(joining), () => ({ index: 0 })).index,
                )
              : Option.getOrElse(
                  Array.findLastIndex(tabs, (tab) => Option.contains(tab.groupId, groupId)),
                  () => tabs.length - 1,
                ) + 1
          yield* moveTabsAndSetGroup(
            tx,
            joining.map(({ tab }) => tab.id),
            destination,
            Option.some(groupId),
          )
          return groupId
        }),
      ),

    ungroup: (tabIds) =>
      transact(
        world,
        "tabs.ungroup",
        Effect.fnUntraced(function* (tx) {
          const locations = yield* Effect.forEach(Array.dedupe(tabIds), (tabId) =>
            requireTab(tx, tabId),
          )
          const grouped = locations.flatMap(({ tab }) =>
            Option.toArray(Option.map(tab.groupId, (groupId) => ({ tabId: tab.id, groupId }))),
          )
          const groupIds = Array.sort(
            Array.dedupe(grouped.map(({ groupId }) => groupId)),
            Order.Number,
          )
          yield* Effect.forEach(
            groupIds,
            (groupId) =>
              ungroupFrom(
                tx,
                groupId,
                grouped.filter((entry) => entry.groupId === groupId).map(({ tabId }) => tabId),
              ),
            { discard: true },
          )
        }),
      ),

    discard: (tabId) =>
      transact(
        world,
        "tabs.discard",
        Effect.fnUntraced(function* (tx) {
          const { window, tab } = yield* requireTab(tx, tabId)
          if (Option.contains(window.activeTabId, tabId)) {
            return yield* tx.reject(`Cannot discard tab with id: ${tabId}.`)
          }
          if (!tab.discarded) {
            yield* updateTab(tx, tabId, (record) => ({
              ...record,
              discarded: true,
              status: "unloaded",
            }))
            yield* emitTabUpdated(tx, tabId, { discarded: true, status: "unloaded" })
          }
          return yield* requireTabSnapshot(tx, tabId)
        }),
      ),

    supportsSplitView,

    createSplit: (tabIds) =>
      transact(
        world,
        "tabs.createSplit",
        Effect.fnUntraced(function* (tx) {
          yield* requireSplitViewApi(tx)
          const first = yield* requireTab(tx, tabIds[0])
          const second = yield* requireTab(tx, tabIds[1])
          if (Option.isSome(first.tab.splitViewId) || Option.isSome(second.tab.splitViewId)) {
            return yield* tx.reject("Tabs already in a split view cannot be split.")
          }
          const problems = splitViewProblems(first, second)
          if (problems.length > 0) return yield* tx.reject(problems.join(" "))
          return yield* splitTabs(tx, tabIds)
        }),
      ),

    unsplit: (splitViewId) =>
      transact(
        world,
        "tabs.unsplit",
        Effect.fnUntraced(function* (tx) {
          yield* requireSplitViewApi(tx)
          if (splitViewMembers(yield* tx.state, splitViewId).length === 0) {
            return yield* tx.reject(`No split view with id: ${splitViewId}.`)
          }
          yield* unsplitTabs(tx, splitViewId)
        }),
      ),
  })
}
