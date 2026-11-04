import { Clock, Effect, Match, Option } from "effect"
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
import type { SidebarCommand, SpotlightOutcome, SpotlightResult } from "#protocol"
import { copyTabWithNotice, type CopyFormat } from "./copy-tab"
import { KatipState } from "./katip-state"
import { runSidebarCommand } from "./sidebar-commands"
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
) {
  const state = yield* KatipState
  const tab = yield* (yield* Tabs).create({
    windowId: callerWindowId,
    active: true,
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

const openUrl = Effect.fnUntraced(function* (callerWindowId: WindowId, url: string) {
  yield* openTabInActiveSpace(callerWindowId, Option.some(url))
  yield* focusWindow(callerWindowId)
  return succeeded
})

const searchWeb = Effect.fnUntraced(function* (callerWindowId: WindowId, query: string) {
  const tab = yield* openTabInActiveSpace(callerWindowId, Option.none())
  yield* (yield* WebSearch).query(query, tab.id)
  yield* focusWindow(callerWindowId)
  return succeeded
})

const failed = (reason: string): SpotlightOutcome => ({ _tag: "Failed", reason })

const finishInCaller = (callerWindowId: WindowId) =>
  Effect.as(focusWindow(callerWindowId), succeeded)

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
    OpenSettings: () => runAsSidebarCommand(callerWindowId, { _tag: "OpenSettings" }),
  })

/**
 * Opens the result chosen in Spotlight. `callerWindowId` is the window Spotlight was opened over:
 * pages open there, and that window is brought back to the front (for an open tab, the tab's own
 * window is). Commands act on the active tab of that window.
 *
 * @remarks
 * Never fails. When the result can't be opened, returns the reason as `Failed`.
 */
export const runSpotlightChoice = (callerWindowId: WindowId, result: SpotlightResult) =>
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
    Bookmark: ({ url }) => openUrl(callerWindowId, url),
    History: ({ url }) => openUrl(callerWindowId, url),
    Action: ({ action }) => runAction(callerWindowId, action),
    OpenUrl: ({ url }) => openUrl(callerWindowId, url),
    SearchWeb: ({ query }) => searchWeb(callerWindowId, query),
  }).pipe(
    Effect.catch((error) =>
      Effect.andThen(
        Effect.logWarning("Couldn't open the Spotlight result", result._tag, error),
        Effect.map(translate("background.spotlight.cannotOpen"), failed),
      ),
    ),
  )
