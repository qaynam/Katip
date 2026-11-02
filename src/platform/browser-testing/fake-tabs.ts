import { Array, Effect, Option, Order, Ref } from "effect"
import {
  type BrowserApiError,
  type BrowserTab,
  type TabCreateOptions,
  TabGroupId,
  TabId,
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
  replaceWindow,
  sameGroup,
  splitViewMembers,
  splitViewProblems,
  tabSnapshot,
  toBrowserTabGroup,
  windowOfGroup,
} from "./browsing-state"
import {
  activateTab,
  assignGroup,
  createTab,
  emitTabUpdated,
  leaveSplitView,
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
  // Chrome は作ったばかりのグループについて、変わっていない見た目の更新も続けて送る
  yield* tx.emit({ _tag: "TabGroupCreated", group: toBrowserTabGroup(group, windowId) })
  yield* tx.emit({ _tag: "TabGroupUpdated", group: toBrowserTabGroup(group, windowId) })
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
    groupId: Option.none(),
  })
  yield* assignGroup(tx, tabId, partner.tab.groupId)
  yield* splitTabs(tx, [partnerId, tabId])
  return tabId
})

const withSplitPartners = (state: BrowsingState, tabIds: ReadonlyArray<TabId>) =>
  Array.dedupe(
    tabIds.flatMap((tabId) =>
      Option.match(
        Option.flatMap(locateTab(state, tabId), ({ tab }) => tab.splitViewId),
        {
          onNone: () => [tabId],
          onSome: (splitViewId) => [
            tabId,
            ...splitViewMembers(state, splitViewId).map(({ tab }) => tab.id),
          ],
        },
      ),
    ),
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

    duplicate: (tabId) =>
      transact(
        world,
        "tabs.duplicate",
        Effect.fnUntraced(function* (tx) {
          yield* leaveSplitView(tx, tabId)
          const { window, index, tab } = yield* requireTab(tx, tabId)
          const duplicateId = yield* createTab(tx, {
            windowId: window.id,
            index: index + 1,
            url: Option.getOrElse(tab.url, () => NEW_TAB_URL),
            active: true,
            pinned: tab.pinned,
            // 複製元ではなく、複製した時点でアクティブだったタブが opener になる
            openerTabId: window.activeTabId,
            groupId: tab.groupId,
          })
          yield* updateTab(tx, duplicateId, (record) => ({ ...record, title: tab.title }))
          return yield* requireTabSnapshot(tx, duplicateId)
        }),
      ),

    remove: (tabIds) =>
      Effect.forEach(
        tabIds,
        (tabId) => transact(world, "tabs.remove", (tx) => removeTab(tx, tabId)),
        { discard: true },
      ),

    // 動かし終えてからまとめて読み直さない。Chrome は 1 つずつ動かし、それぞれを動かした
    // 時点のタブを返す
    move: (tabIds, options) =>
      Effect.map(
        Effect.reduce(
          tabIds,
          (): { readonly target: number | "end"; readonly moved: ReadonlyArray<BrowserTab> } => ({
            target: options.index,
            moved: [],
          }),
          ({ target, moved }, tabId) =>
            transact(
              world,
              "tabs.move",
              Effect.fnUntraced(function* (tx) {
                const placed = yield* moveTab(
                  tx,
                  tabId,
                  target,
                  Option.fromUndefinedOr(options.windowId),
                )
                const snapshot = yield* requireTabSnapshot(tx, tabId)
                return {
                  target: target === "end" ? target : placed + 1,
                  moved: [...moved, snapshot],
                }
              }),
            ),
        ),
        ({ moved }) => moved,
      ),

    group: (options) =>
      transact(
        world,
        "tabs.group",
        Effect.fnUntraced(function* (tx) {
          yield* Effect.forEach(options.tabIds, (tabId) => requireTab(tx, tabId), {
            discard: true,
          })
          // 分割ビューの片方だけを入れても、Chrome はもう片方も一緒に入れて分割を保つ
          const tabIds = withSplitPartners(yield* tx.state, options.tabIds)
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
          yield* Effect.forEach(tabIds, (tabId) => requireTab(tx, tabId), { discard: true })
          const locations = yield* Effect.forEach(
            withSplitPartners(yield* tx.state, tabIds),
            (tabId) => requireTab(tx, tabId),
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
          if (tab.discarded) return yield* requireTabSnapshot(tx, tabId)
          // Chrome は破棄したタブを新しい ID のタブに置き換える。分割やグループは置き換えた先に残る
          const [id, issued] = issueId(yield* tx.state)
          const replacement = TabId.make(id)
          yield* tx.setState(
            replaceWindow(issued, {
              ...window,
              tabs: window.tabs.map((other) =>
                other.id === tabId
                  ? { ...other, id: replacement, discarded: true, status: "unloaded" }
                  : Option.contains(other.openerTabId, tabId)
                    ? { ...other, openerTabId: Option.some(replacement) }
                    : other,
              ),
            }),
          )
          yield* tx.emit({ _tag: "TabReplaced", addedTabId: replacement, removedTabId: tabId })
          yield* emitTabUpdated(tx, replacement, { discarded: true, status: "unloaded" })
          return yield* requireTabSnapshot(tx, replacement)
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
