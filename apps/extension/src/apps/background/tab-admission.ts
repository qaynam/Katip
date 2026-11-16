import { Clock, Effect, MutableHashSet, Option, pipe } from "effect"
import { SettingsRepository } from "#modules/settings"
import type { DisplayPlacement } from "#modules/tab-order"
import {
  claimRestoreRecord,
  isNewTabPage,
  isTemporary,
  restoreTab,
  spaceOf,
  trackedTab,
  trackTab,
  type NewTab,
  type PlacementContext,
  type TrackedTab,
  type Workspace,
} from "#modules/workspace"
import type { BrowserTab, TabId } from "#platform/browser"
import { ExtensionInfo } from "./extension-info"
import { KatipState } from "./katip-state"
import { moveAmongTemporary } from "./temporary-order"

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

// A tab created before its URL is known is placed by the usual rules for now, and matched against
// the restore records again once its URL is known. Kept only in memory, though lost when the
// service worker stops: it matters only in the few minutes after a restart
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

const admit = Effect.fnUntraced(function* <R>(
  tab: BrowserTab,
  claimsRestoreRecord: boolean,
  beforeTracking: (workspaceWithTab: Workspace) => Effect.Effect<void, never, R>,
) {
  const state = yield* KatipState
  if (Option.isSome(spaceOf(yield* state.workspace.get, tab.id)) || tab.pinned) return
  const url = urlOf(tab)
  if (claimsRestoreRecord && (yield* claimFromRestoreQueue(tab, url))) return
  const context = yield* placementContext
  const track = (workspace: Workspace) => trackTab(workspace, newTabFrom(tab), context)
  // Not tracked first: views list only tracked tabs, and one built while beforeTracking moved the
  // tab would show it where Chrome opened it
  yield* beforeTracking(track(yield* state.workspace.get))
  yield* state.workspace.update(track)
  if (url === "" && (yield* state.restoreQueue.get) !== null) {
    MutableHashSet.add(provisionalTabs, tab.id)
  }
})

const leaveWhereItIs = () => Effect.void

/**
 * Places a tab that belongs to no Space yet in one, preferring a restore record from before the
 * restart when there is one.
 *
 * Does nothing to a tab that already has a Space, so it's safe to call any number of times for
 * the same tab.
 */
export const admitTab = (tab: BrowserTab) => admit(tab, true, leaveWhereItIs)

/**
 * Places a tab Chrome has just unpinned, as {@link admitTab} does, but never by a restore record.
 *
 * @remarks
 * Chrome unpins a Favorite's tab right before closing it. Claiming a record then would spend it on
 * a tab about to close, and the tab it was kept for, opened after, would lose its Space.
 */
export const admitUnpinnedTab = (tab: BrowserTab) => admit(tab, false, leaveWhereItIs)

const placementBelowOpener = (
  workspace: Workspace,
  opened: TrackedTab,
  openerTabId: TabId,
): DisplayPlacement =>
  Option.exists(
    trackedTab(workspace, openerTabId),
    (opener) => opener.spaceId === opened.spaceId && isTemporary(opener),
  )
    ? { _tag: "Below", tabId: openerTabId }
    : { _tag: "Top" }

// Not counting a tab without a URL as a new tab page, as choosing its Space does: Chrome gives the
// new tab pages it opens their URL from the start, and only a tab a page opens itself (a link with
// target="_blank", window.open) comes without one, for as long as the page takes to start loading.
// Waiting for that URL would let views show the tab where Chrome opened it until then
const opensNewTabPage = (tab: BrowserTab) => {
  const url = urlOf(tab)
  return url !== "" && isNewTabPage(url)
}

const placeOpenedTab = Effect.fnUntraced(function* (tab: BrowserTab, workspaceWithTab: Workspace) {
  const opener = tab.openerTabId
  if (Option.isNone(opener) || opensNewTabPage(tab)) return
  const opened = trackedTab(workspaceWithTab, tab.id)
  if (Option.isNone(opened) || !isTemporary(opened.value)) return
  yield* moveAmongTemporary(
    [tab],
    opened.value.spaceId,
    placementBelowOpener(workspaceWithTab, opened.value, opener.value),
  )
})

/**
 * Admits a tab Chrome has just created, as {@link admitTab} does. A tab opened from another tab,
 * such as by a link, shows right below that tab, above the ones it opened before. Opened from a
 * pin, from a live item's tab, or from a tab outside the Space, it shows at the top of the
 * temporary tabs. A new tab page stays where Chrome opened it.
 *
 * The tab is moved before it joins its Space, so no view shows it anywhere else first.
 */
export const admitCreatedTab = (tab: BrowserTab) =>
  admit(tab, true, (workspaceWithTab) =>
    placeOpenedTab(tab, workspaceWithTab).pipe(
      // Not failing the admission: a tab Chrome wouldn't move still has to join its Space
      Effect.catch((error) => Effect.logWarning("Couldn't place the opened tab", error)),
    ),
  )

/** Once a provisionally placed tab's URL is known, matches it against the restore records again. */
export const settleProvisionalTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (!MutableHashSet.has(provisionalTabs, tab.id)) return
  const url = urlOf(tab)
  if (url === "") return
  MutableHashSet.remove(provisionalTabs, tab.id)
  yield* claimFromRestoreQueue(tab, url)
})

/** Forgets what is kept about a closed tab until its URL is known. */
export const forgetPendingTab = (tabId: TabId) =>
  Effect.sync(() => MutableHashSet.remove(provisionalTabs, tabId))
