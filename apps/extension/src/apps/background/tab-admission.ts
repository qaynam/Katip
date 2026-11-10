import { Clock, Effect, MutableHashSet, Option, pipe } from "effect"
import { SettingsRepository } from "#modules/settings"
import type { DisplayPlacement } from "#modules/tab-order"
import {
  claimRestoreRecord,
  isNewTabPage,
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

const admit = Effect.fnUntraced(function* (tab: BrowserTab, claimsRestoreRecord = true) {
  const state = yield* KatipState
  if (Option.isSome(spaceOf(yield* state.workspace.get, tab.id)) || tab.pinned) return "Skipped"
  const url = urlOf(tab)
  if (claimsRestoreRecord && (yield* claimFromRestoreQueue(tab, url))) return "Restored"
  const context = yield* placementContext
  yield* state.workspace.update((workspace) => trackTab(workspace, newTabFrom(tab), context))
  if (url === "" && (yield* state.restoreQueue.get) !== null) {
    MutableHashSet.add(provisionalTabs, tab.id)
  }
  return "Tracked"
})

/**
 * Places a tab that belongs to no Space yet in one, preferring a restore record from before the
 * restart when there is one.
 *
 * Does nothing to a tab that already has a Space, so it's safe to call any number of times for
 * the same tab.
 */
export const admitTab = (tab: BrowserTab) => Effect.asVoid(admit(tab))

/**
 * Places a tab Chrome has just unpinned, as {@link admitTab} does, but never by a restore record.
 *
 * @remarks
 * Chrome unpins a Favorite's tab right before closing it. Claiming a record then would spend it on
 * a tab about to close, and the tab it was kept for, opened after, would lose its Space.
 */
export const admitUnpinnedTab = (tab: BrowserTab) => Effect.asVoid(admit(tab, false))

const placementBelowOpener = (
  workspace: Workspace,
  opened: TrackedTab,
  openerTabId: TabId,
): DisplayPlacement =>
  Option.exists(
    trackedTab(workspace, openerTabId),
    (opener) => opener.spaceId === opened.spaceId && opener.pinned === null,
  )
    ? { _tag: "Below", tabId: openerTabId }
    : { _tag: "Top" }

// Chrome creates a link's tab before its URL is known, the same as a new tab page, which can have an
// opener too. Such a tab is placed once its URL tells them apart. Kept only in memory, like
// provisionalTabs: the URL follows within moments
const tabsAwaitingPlacement = MutableHashSet.empty<TabId>()

const placeOpenedTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  const opener = tab.openerTabId
  if (Option.isNone(opener) || isNewTabPage(urlOf(tab))) return
  const workspace = yield* (yield* KatipState).workspace.get
  const opened = trackedTab(workspace, tab.id)
  if (Option.isNone(opened) || opened.value.pinned !== null) return
  yield* moveAmongTemporary(
    [tab],
    opened.value.spaceId,
    placementBelowOpener(workspace, opened.value, opener.value),
  )
})

/**
 * Admits a tab Chrome has just created, as {@link admitTab} does. A tab opened from another tab,
 * such as by a link, then moves to show right below that tab, above the ones it opened before.
 * Opened from a pin or from a tab outside the Space, it goes to the top of the temporary tabs.
 *
 * A tab created without its URL moves once {@link placeOnceUrlIsKnown} sees the URL.
 */
export const admitCreatedTab = Effect.fnUntraced(function* (tab: BrowserTab) {
  if ((yield* admit(tab)) !== "Tracked" || Option.isNone(tab.openerTabId)) return
  if (urlOf(tab) === "") {
    MutableHashSet.add(tabsAwaitingPlacement, tab.id)
    return
  }
  yield* placeOpenedTab(tab)
})

/** Moves a tab that {@link admitCreatedTab} admitted without a URL, once the URL is known. */
export const placeOnceUrlIsKnown = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (!MutableHashSet.has(tabsAwaitingPlacement, tab.id) || urlOf(tab) === "") return
  MutableHashSet.remove(tabsAwaitingPlacement, tab.id)
  yield* placeOpenedTab(tab)
})

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
  Effect.sync(() => {
    MutableHashSet.remove(provisionalTabs, tabId)
    MutableHashSet.remove(tabsAwaitingPlacement, tabId)
  })
