import { Array, Clock, Effect, Option, Order } from "effect"
import { SpaceFolders } from "#modules/pinned"
import { addSpace, SpaceId, SpaceName, type SpaceList } from "#modules/space"
import {
  activeSpaceOf,
  forgetTab,
  spaceOf,
  startRestore,
  switchSpace,
  type Workspace,
} from "#modules/workspace"
import { Tabs, type BrowserTab } from "#platform/browser"
import { pruneStaleBindings } from "./bindings"
import { KatipState, loadRestoreSnapshot } from "./katip-state"
import { admitTab } from "./tab-admission"

export const newSpaceId = Effect.sync(() => SpaceId.make(crypto.randomUUID()))

const ensureAtLeastOneSpace = Effect.fnUntraced(function* (spaces: SpaceList) {
  if (spaces.length > 0) return spaces
  const folders = yield* SpaceFolders
  const withHome = addSpace([], { id: yield* newSpaceId, name: SpaceName.make("ホーム") })
  yield* Effect.forEach(withHome, (space) => folders.ensureSpaceFolder(space))
  return withHome
})

const byWindowThenIndex = Order.combine(
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.windowId),
  Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index),
)

const forgetClosedTabs = (workspace: Workspace, alive: ReadonlySet<number>) =>
  workspace.tabs
    .filter((tab) => !alive.has(tab.tabId))
    .reduce((acc, tab) => forgetTab(acc, tab.tabId), workspace)

const activateSpacesOfActiveTabs = (
  workspace: Workspace,
  tabs: ReadonlyArray<BrowserTab>,
): Workspace =>
  tabs
    .filter((tab) => tab.active)
    .reduce(
      (acc, tab) =>
        Option.isSome(activeSpaceOf(acc, tab.windowId))
          ? acc
          : Option.match(spaceOf(acc, tab.id), {
              onNone: () => acc,
              onSome: (spaceId) => switchSpace(acc, tab.windowId, spaceId),
            }),
      workspace,
    )

/**
 * service worker の起動時に、保存された状態をブラウザの現状に合わせる。
 *
 * 起動を待つ間に届いたイベントは、この後で順に処理される。ここで所属させたタブの
 * TabCreated が後から届いても、所属済みなので二重には処理されない。
 */
export const initialize = Effect.gen(function* () {
  const state = yield* KatipState
  const folders = yield* SpaceFolders
  const now = yield* Clock.currentTimeMillis

  if (state.isFreshSession) {
    const snapshot = yield* loadRestoreSnapshot
    yield* state.restoreQueue.update(() =>
      Option.getOrNull(Option.map(snapshot, (records) => startRestore(records, now))),
    )
  }

  yield* state.spaces.updateEffect((spaces) =>
    Effect.flatMap(folders.reconcileSpaces(spaces), ensureAtLeastOneSpace),
  )

  const tabs = Array.sort(yield* (yield* Tabs).query({}), byWindowThenIndex)
  const alive = new Set<number>(tabs.map((tab) => tab.id))
  yield* state.workspace.update((workspace) => forgetClosedTabs(workspace, alive))
  yield* Effect.forEach(tabs, admitTab, { discard: true })
  yield* state.workspace.update((workspace) => activateSpacesOfActiveTabs(workspace, tabs))
  yield* pruneStaleBindings
})
