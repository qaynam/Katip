import { Clock, Effect, MutableHashSet, Option, pipe } from "effect"
import { SettingsRepository } from "#modules/settings"
import {
  claimRestoreRecord,
  restoreTab,
  spaceOf,
  trackTab,
  type NewTab,
  type PlacementContext,
} from "#modules/workspace"
import type { BrowserTab, TabId } from "#platform/browser"
import { ExtensionInfo } from "./extension-info"
import { KatipState } from "./katip-state"

export const urlOf = (tab: BrowserTab) =>
  pipe(
    tab.url,
    Option.orElse(() => tab.pendingUrl),
    Option.getOrElse(() => ""),
  )

const newTabFrom = (tab: BrowserTab): NewTab => ({
  tabId: tab.id,
  windowId: tab.windowId,
  url: urlOf(tab),
  openerTabId: tab.openerTabId,
  isChromePinned: tab.pinned,
})

export const placementContext = Effect.gen(function* () {
  const state = yield* KatipState
  const settings = yield* (yield* SettingsRepository).get
  const info = yield* ExtensionInfo
  return {
    spaces: yield* state.spaces.get,
    defaultSpaceId: Option.fromNullishOr(settings.defaultSpaceId),
    extensionOrigin: info.origin,
    now: yield* Clock.currentTimeMillis,
  } satisfies PlacementContext
})

// URL がまだ決まらないうちに作られたタブは、ひとまず通常の規則で置いておき、URL が
// 決まった時点で復元レコードと照合し直す。再起動直後の数分しか意味を持たないので、
// service worker が止まれば失われるメモリ上の記録で足りる
const provisionalTabs = MutableHashSet.empty<TabId>()

const claimFromRestoreQueue = Effect.fnUntraced(function* (tab: BrowserTab, url: string) {
  const state = yield* KatipState
  const context = yield* placementContext
  const queue = yield* state.restoreQueue.get
  const exists = (spaceId: string) => context.spaces.some((space) => space.id === spaceId)
  const claimed =
    queue === null || url === ""
      ? Option.none()
      : claimRestoreRecord(queue, url, context.now, exists)
  if (Option.isNone(claimed)) return false
  const [record, rest] = claimed.value
  yield* state.workspace.update((workspace) => restoreTab(workspace, tab.id, record, context.now))
  yield* state.restoreQueue.update(() => rest)
  return true
})

/**
 * まだどの Space にも属していないタブを所属させる。再起動後の復元レコードがあればそれを優先する。
 *
 * 既に所属しているタブには何もしないので、同じタブについて何度呼んでもよい。
 */
export const admitTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  const state = yield* KatipState
  if (Option.isSome(spaceOf(yield* state.workspace.get, tab.id)) || tab.pinned) return
  const url = urlOf(tab)
  if (yield* claimFromRestoreQueue(tab, url)) return
  const context = yield* placementContext
  yield* state.workspace.update((workspace) => trackTab(workspace, newTabFrom(tab), context))
  if (url === "" && (yield* state.restoreQueue.get) !== null) {
    MutableHashSet.add(provisionalTabs, tab.id)
  }
})

/** URL が決まったタブを、仮置きしていたなら復元レコードと照合し直す。 */
export const settleProvisionalTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (!MutableHashSet.has(provisionalTabs, tab.id)) return
  const url = urlOf(tab)
  if (url === "") return
  MutableHashSet.remove(provisionalTabs, tab.id)
  yield* claimFromRestoreQueue(tab, url)
})

export const forgetProvisionalTab = (tabId: TabId) =>
  Effect.sync(() => MutableHashSet.remove(provisionalTabs, tabId))
