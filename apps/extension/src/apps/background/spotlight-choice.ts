import { Clock, Effect, Match, Option, Schedule } from "effect"
import type { Action } from "#modules/actions"
import { activeSpaceOf, assignTab, trackedTab } from "#modules/workspace"
import {
  type BrowserTab,
  Tabs,
  type TabId,
  WebSearch,
  type WindowId,
  Windows,
} from "#platform/browser"
import {
  historySearchSettingsUrl,
  type SidebarCommand,
  type SidebarPanel,
  type SpotlightOutcome,
  type SpotlightResult,
  type SpotlightTarget,
} from "#protocol"
import { copyTabWithNotice, type CopyFormat } from "./copy-tab"
import { ExtensionInfo } from "./extension-info"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"
import { SidebarHub } from "./sidebar-hub"
import { currentTranslator, translate } from "./translation"

const succeeded: SpotlightOutcome = { _tag: "Succeeded" }

const focusWindow = (windowId: WindowId) =>
  Windows.use((windows) => windows.update(windowId, { focused: true }))

const activateTab = Effect.fnUntraced(function* (tabId: TabId) {
  const tab = yield* (yield* Tabs).update(tabId, { active: true })
  yield* focusWindow(tab.windowId)
  return succeeded
})

// Runs the side panel's command rather than its own logic, so pins open and Spaces switch by the
// same rules as from the side panel
const runAsSidebarCommand = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  command: SidebarCommand,
) {
  const outcome = yield* runSidebarCommand(command)
  if (outcome._tag === "Failed") return outcome satisfies SpotlightOutcome
  yield* focusWindow(callerWindowId)
  return succeeded
})

// Not left to the handling of the creation event, which also places the tab: by then the active
// Space may have changed, and the tab belongs in the Space active when it was opened
const openTabInActiveSpace = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  url: Option.Option<string>,
  active = true,
) {
  const state = yield* KatipState
  const tab = yield* (yield* Tabs).create({
    windowId: callerWindowId,
    active,
    ...Option.match(url, { onNone: () => ({}), onSome: (value) => ({ url: value }) }),
  })
  const activeSpaceId = activeSpaceOf(yield* state.workspace.get, callerWindowId)
  if (Option.isSome(activeSpaceId)) {
    const now = yield* Clock.currentTimeMillis
    yield* state.workspace.update((workspace) =>
      assignTab(workspace, tab.id, activeSpaceId.value, now),
    )
  }
  return tab
})

const activeTabOf = (windowId: WindowId) =>
  Tabs.use((tabs) =>
    Effect.map(tabs.query({ windowId, active: true }), (active) => Option.fromNullishOr(active[0])),
  )

/**
 * The tab a page or search chosen with `target` opens in: the active tab of the caller's window
 * for `CurrentTab`, or a new tab in its active Space.
 */
const tabToOpenIn = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  target: SpotlightTarget,
  url: Option.Option<string>,
) {
  const current = target === "CurrentTab" ? yield* activeTabOf(callerWindowId) : Option.none()
  if (Option.isNone(current)) return yield* openTabInActiveSpace(callerWindowId, url)
  if (Option.isSome(url)) {
    yield* (yield* Tabs).update(current.value.id, { url: url.value })
  }
  return current.value
})

const openUrl = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  url: string,
  target: SpotlightTarget,
) {
  yield* tabToOpenIn(callerWindowId, target, Option.some(url))
  yield* focusWindow(callerWindowId)
  return succeeded
})

// Past this, a search's tab is brought to the front even with its results yet to come
const RESULTS_WAIT = "2 seconds"

const showsWebPage = (tab: BrowserTab) => Option.exists(tab.url, (url) => /^https?:/.test(url))

// A tab's URL is the last one committed, so it turns to the results' once they start to show
const untilResultsShow = (tabId: TabId) =>
  Tabs.use((tabs) => tabs.get(tabId)).pipe(
    Effect.repeat({ schedule: Schedule.spaced("50 millis"), until: showsWebPage }),
    Effect.timeout(RESULTS_WAIT),
    Effect.ignore,
  )

const searchWeb = Effect.fnUntraced(function* (
  callerWindowId: WindowId,
  query: string,
  target: SpotlightTarget,
) {
  const current = target === "CurrentTab" ? yield* activeTabOf(callerWindowId) : Option.none()
  if (Option.isSome(current)) {
    yield* (yield* WebSearch).query(query, current.value.id)
    yield* focusWindow(callerWindowId)
    return succeeded
  }
  // A new tab comes to the front only once its results have started to show, into a window
  // already in front: brought forward with nothing shown yet, Brave puts the focus in its address
  // bar, and it stayed there once the results came in, so what was typed next went into the
  // address bar, not the page. A tab that shows a page gets the page focused, as any tab opened in
  // the background does when switched to
  const tab = yield* openTabInActiveSpace(callerWindowId, Option.none(), false)
  yield* (yield* WebSearch).query(query, tab.id)
  yield* untilResultsShow(tab.id)
  yield* focusWindow(callerWindowId)
  yield* (yield* Tabs).update(tab.id, { active: true })
  return succeeded
})

const failed = (reason: string): SpotlightOutcome => ({ _tag: "Failed", reason })

const openHistorySearchSettings = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const { origin } = yield* ExtensionInfo
  yield* (yield* Tabs).create({
    windowId: callerWindowId,
    active: true,
    url: historySearchSettingsUrl(origin),
  })
  yield* focusWindow(callerWindowId)
  return succeeded
})

const finishInCaller = (callerWindowId: WindowId) =>
  Effect.as(focusWindow(callerWindowId), succeeded)

const showPanelIn = (callerWindowId: WindowId, panel: SidebarPanel) =>
  Effect.andThen(
    SidebarHub.use((hub) => hub.showPanel(callerWindowId, panel)),
    finishInCaller(callerWindowId),
  )

const onActiveTab = Effect.fnUntraced(function* <E, R>(
  callerWindowId: WindowId,
  run: (tab: BrowserTab) => Effect.Effect<SpotlightOutcome, E, R>,
) {
  const [activeTab] = yield* (yield* Tabs).query({ windowId: callerWindowId, active: true })
  if (activeTab === undefined) return failed(yield* translate("background.tab.noTarget"))
  return yield* run(activeTab)
})

const copyActiveTab = (callerWindowId: WindowId, format: CopyFormat) =>
  onActiveTab(callerWindowId, (tab) =>
    Effect.gen(function* () {
      if (yield* copyTabWithNotice(tab, format)) return yield* finishInCaller(callerWindowId)
      return failed((yield* currentTranslator).t("actions.copyFailed"))
    }),
  )

const togglePinOf = Effect.fnUntraced(function* (callerWindowId: WindowId, tab: BrowserTab) {
  const tracked = trackedTab(yield* (yield* KatipState).workspace.get, tab.id)
  const isPinned = Option.exists(tracked, ({ pinned }) => pinned !== null)
  return yield* runAsSidebarCommand(
    callerWindowId,
    isPinned ? { _tag: "UnpinTab", tabId: tab.id } : { _tag: "PinTab", tabId: tab.id },
  )
})

const closeTemporaryTabs = Effect.fnUntraced(function* (callerWindowId: WindowId) {
  const spaceId = activeSpaceOf(yield* (yield* KatipState).workspace.get, callerWindowId)
  if (Option.isNone(spaceId)) {
    return failed(yield* translate("background.spotlight.noActiveSpace"))
  }
  return yield* runAsSidebarCommand(callerWindowId, {
    _tag: "CloseTemporaryTabs",
    windowId: callerWindowId,
    spaceId: spaceId.value,
  })
})

// The new tab goes on the right of the shown one, as a tab let go over the right of the page does
const splitWithNewTab = Effect.fnUntraced(function* (callerWindowId: WindowId, tab: BrowserTab) {
  const tabs = yield* Tabs
  const created = yield* tabs.create({ windowId: tab.windowId, active: false })
  const outcome = yield* runAsSidebarCommand(callerWindowId, {
    _tag: "SplitTabs",
    tabId: created.id,
    withTabId: tab.id,
    side: "Right",
  })
  // Opened only to be split, it would otherwise be left behind among the tabs
  if (outcome._tag === "Failed") yield* tabs.remove([created.id])
  return outcome
})

const unsplit = (callerWindowId: WindowId, tab: BrowserTab) =>
  Option.match(tab.splitViewId, {
    onNone: () => Effect.map(translate("background.split.notFound"), failed),
    onSome: (splitViewId) => runAsSidebarCommand(callerWindowId, { _tag: "Unsplit", splitViewId }),
  })

// Pinning, closing a tab, moving it to a Space and the like follow the same rules as from the
// side panel
const runAction = (callerWindowId: WindowId, action: Action) =>
  Match.valueTags(action, {
    CopyUrl: () => copyActiveTab(callerWindowId, "Url"),
    CopyMarkdownLink: () => copyActiveTab(callerWindowId, "MarkdownLink"),
    TogglePin: () => onActiveTab(callerWindowId, (tab) => togglePinOf(callerWindowId, tab)),
    DuplicateTab: () =>
      onActiveTab(callerWindowId, (tab) =>
        Effect.andThen(
          Tabs.use((tabs) => tabs.duplicate(tab.id)),
          finishInCaller(callerWindowId),
        ),
      ),
    SplitWithNewTab: () =>
      onActiveTab(callerWindowId, (tab) => splitWithNewTab(callerWindowId, tab)),
    Unsplit: () => onActiveTab(callerWindowId, (tab) => unsplit(callerWindowId, tab)),
    CloseTab: () =>
      onActiveTab(callerWindowId, (tab) =>
        runAsSidebarCommand(callerWindowId, { _tag: "CloseTab", tabId: tab.id }),
      ),
    ToggleMute: () =>
      onActiveTab(callerWindowId, (tab) =>
        Effect.andThen(
          Tabs.use((tabs) => tabs.update(tab.id, { muted: !tab.muted })),
          finishInCaller(callerWindowId),
        ),
      ),
    MoveTabToSpace: ({ spaceId }) =>
      onActiveTab(callerWindowId, (tab) =>
        runAsSidebarCommand(callerWindowId, { _tag: "MoveTabToSpace", tabId: tab.id, spaceId }),
      ),
    CloseTemporaryTabs: () => closeTemporaryTabs(callerWindowId),
    // Spotlight opens a closed side panel itself, being the only one able to
    ToggleSidebar: ({ isOpen }) =>
      isOpen
        ? Effect.andThen(
            SidebarHub.use((hub) => hub.closeSidePanel(callerWindowId)),
            finishInCaller(callerWindowId),
          )
        : finishInCaller(callerWindowId),
    OpenArchive: () => showPanelIn(callerWindowId, "Archive"),
    OpenDownloads: () => showPanelIn(callerWindowId, "Downloads"),
    // Spotlight puts itself in history mode instead of sending it: one sent anyway has nothing to
    // open
    SearchHistory: () => Effect.map(translate("background.spotlight.cannotOpen"), failed),
    OpenSettings: () => runAsSidebarCommand(callerWindowId, { _tag: "OpenSettings" }),
  })

/**
 * Opens the result chosen in Spotlight. `callerWindowId` is the window Spotlight was opened over:
 * pages open there, and that window is brought back to the front (for an open tab, the tab's own
 * window is). Commands act on the active tab of that window. A page or search, such as a typed
 * address or a bookmark, opens where `target` says; the rest open as they always do.
 *
 * @remarks
 * Never fails. When the result can't be opened, returns the reason as `Failed`.
 */
export const runSpotlightChoice = (
  callerWindowId: WindowId,
  result: SpotlightResult,
  target: SpotlightTarget,
) =>
  Match.valueTags(result, {
    OpenTab: ({ tabId }) => activateTab(tabId),
    Pin: ({ bookmarkId }) =>
      runAsSidebarCommand(callerWindowId, {
        _tag: "OpenPinnedItem",
        windowId: callerWindowId,
        bookmarkId,
      }),
    Favorite: ({ favoriteId }) =>
      runAsSidebarCommand(callerWindowId, {
        _tag: "OpenFavorite",
        windowId: callerWindowId,
        favoriteId,
      }),
    Space: ({ spaceId }) =>
      runAsSidebarCommand(callerWindowId, {
        _tag: "SwitchSpace",
        windowId: callerWindowId,
        spaceId,
      }),
    Bookmark: ({ url }) => openUrl(callerWindowId, url, target),
    History: ({ url }) => openUrl(callerWindowId, url, target),
    Action: ({ action }) => runAction(callerWindowId, action),
    // Spotlight fills in the keyword of a command that searches instead of sending it; one sent
    // anyway has no query to search for, so it opens the site
    SiteCommand: ({ url, searches, iconPageUrl }) =>
      openUrl(callerWindowId, searches ? iconPageUrl : url, target),
    SiteSearch: ({ url }) => openUrl(callerWindowId, url, target),
    BangSuggestion: ({ iconPageUrl }) => openUrl(callerWindowId, iconPageUrl, target),
    TurnOnHistorySearch: () => openHistorySearchSettings(callerWindowId),
    OpenUrl: ({ url }) => openUrl(callerWindowId, url, target),
    SearchWeb: ({ query }) => searchWeb(callerWindowId, query, target),
  }).pipe(
    Effect.catch((error) =>
      Effect.andThen(
        Effect.logWarning("Couldn't open the Spotlight result", result._tag, error),
        Effect.map(translate("background.spotlight.cannotOpen"), failed),
      ),
    ),
  )
