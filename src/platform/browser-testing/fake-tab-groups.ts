import { Array, Effect, Equivalence, Option, Ref } from "effect"
import {
  type BrowserApiError,
  type BrowserTabGroup,
  type TabGroupId,
  type TabGroupQuery,
  TabGroups,
} from "#platform/browser"
import {
  allGroups,
  type GroupRecord,
  groupEnclosingGap,
  groupSnapshot,
  pinnedCount,
  sameGroup,
  successorOutsideGroup,
  windowOfGroup,
} from "./browsing-state"
import {
  activateTab,
  createTab,
  moveWithinWindow,
  NEW_TAB_URL,
  requireGroup,
  requireWindow,
  transferTab,
  updateGroup,
} from "./browsing-steps"
import { type BrowsingTx, chromeCall, type FakeWorld, transact } from "./fake-world"

const matchesGroupQuery = (query: TabGroupQuery) => (group: BrowserTabGroup) =>
  (query.windowId === undefined || group.windowId === query.windowId) &&
  (query.collapsed === undefined || group.collapsed === query.collapsed) &&
  (query.color === undefined || group.color === query.color) &&
  (query.title === undefined || Option.getOrElse(group.title, () => "") === query.title)

const sameTitle = Option.makeEquivalence(Equivalence.strictEqual<string>())

const looksSame = (a: GroupRecord, b: GroupRecord) =>
  sameTitle(a.title, b.title) && a.color === b.color && a.collapsed === b.collapsed

const requireGroupSnapshot = Effect.fnUntraced(function* (
  tx: BrowsingTx,
  groupId: TabGroupId,
): Effect.fn.Return<BrowserTabGroup, BrowserApiError> {
  const group = groupSnapshot(yield* tx.state, groupId)
  if (Option.isNone(group)) return yield* tx.reject(`No group with id: ${groupId}.`)
  return group.value
})

/** 折りたたむグループにアクティブなタブがあれば、グループの外のタブへアクティブを移す。 */
const moveActivationOutOf = Effect.fnUntraced(function* (tx: BrowsingTx, groupId: TabGroupId) {
  const state = yield* tx.state
  const window = windowOfGroup(state, groupId)
  if (Option.isNone(window)) return
  const { tabs, activeTabId, id: windowId } = window.value
  const activeIndex = tabs.findIndex((tab) => Option.contains(activeTabId, tab.id))
  const activeIsInGroup = tabs.some(
    (tab) => Option.contains(activeTabId, tab.id) && Option.contains(tab.groupId, groupId),
  )
  if (!activeIsInGroup) return
  const successor = successorOutsideGroup(state, tabs, activeIndex, groupId)
  if (Option.isSome(successor)) return yield* activateTab(tx, successor.value)
  // 外に移れるタブが無ければ、Chrome は新しいタブを開いてそこへ移る
  yield* createTab(tx, {
    windowId,
    index: "end",
    url: NEW_TAB_URL,
    active: true,
    pinned: false,
    openerTabId: Option.none(),
  })
})

export const makeFakeTabGroups = (world: FakeWorld): TabGroups["Service"] =>
  TabGroups.of({
    query: (query) =>
      chromeCall(
        world,
        "tabGroups.query",
        Effect.map(Ref.get(world.browsing), (state) =>
          allGroups(state).filter(matchesGroupQuery(query)),
        ),
      ),

    get: (groupId) => transact(world, "tabGroups.get", (tx) => requireGroupSnapshot(tx, groupId)),

    update: (groupId, options) =>
      transact(
        world,
        "tabGroups.update",
        Effect.fnUntraced(function* (tx) {
          const before = yield* requireGroup(tx, groupId)
          if (options.collapsed === true && !before.collapsed) {
            yield* moveActivationOutOf(tx, groupId)
          }
          const current = yield* requireGroup(tx, groupId)
          const next: GroupRecord = {
            ...current,
            title:
              options.title === undefined
                ? current.title
                : Option.filter(Option.some(options.title), (title) => title.length > 0),
            color: options.color ?? current.color,
            collapsed: options.collapsed ?? current.collapsed,
          }
          if (!looksSame(current, next)) yield* updateGroup(tx, next)
          return yield* requireGroupSnapshot(tx, groupId)
        }),
      ),

    move: (groupId, options) =>
      transact(
        world,
        "tabGroups.move",
        Effect.fnUntraced(function* (tx) {
          const source = yield* requireGroupSnapshot(tx, groupId)
          const target = yield* requireWindow(tx, options.windowId ?? source.windowId)
          const sourceWindow = yield* requireWindow(tx, source.windowId)
          const members = sourceWindow.tabs.filter((tab) => Option.contains(tab.groupId, groupId))
          const remaining = target.tabs.filter((tab) => !Option.contains(tab.groupId, groupId))
          const index = Math.min(
            Math.max(options.index === "end" ? remaining.length : options.index, 0),
            remaining.length,
          )
          if (index < pinnedCount(remaining)) {
            return yield* tx.reject(
              "Cannot move the group to an index that is in the middle of pinned tabs.",
            )
          }
          if (Option.isSome(groupEnclosingGap(remaining, index))) {
            return yield* tx.reject(
              "Cannot move the group to an index that is in the middle of another group.",
            )
          }
          if (target.id !== sourceWindow.id) {
            yield* Effect.forEach(
              members,
              (tab, i) => transferTab(tx, tab.id, target.id, index + i, true),
              { discard: true },
            )
          } else {
            const currentIndex = target.tabs.findIndex((tab) =>
              sameGroup(tab.groupId, Option.some(groupId)),
            )
            if (index === currentIndex) return source
            // 右へ動かすときは右端のタブから動かすと、まだ動かしていないタブの位置がずれない
            const order = index < currentIndex ? members : Array.reverse(members)
            yield* Effect.forEach(
              order,
              (tab) => moveWithinWindow(tx, tab.id, index + members.indexOf(tab)),
              { discard: true },
            )
          }
          const moved = yield* requireGroupSnapshot(tx, groupId)
          yield* tx.emit({ _tag: "TabGroupMoved", group: moved })
          return moved
        }),
      ),
  })
