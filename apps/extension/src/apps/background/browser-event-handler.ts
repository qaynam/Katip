import { Clock, Effect, Match } from "effect"
import { forgetTab, forgetWindow, recordActivation, replaceTab } from "#modules/workspace"
import type { BrowserEvent } from "#platform/browser"
import {
  adoptPinnedTab,
  followMovedFavoriteTab,
  refreshFavoriteTitle,
  releaseFavoriteTab,
  replaceFavoriteTab,
} from "./favorites"
import {
  admitCreatedTab,
  admitTab,
  forgetPendingTab,
  placeOnceUrlIsKnown,
  settleProvisionalTab,
} from "./tab-admission"
import { KatipState } from "./katip-state"

const handleTabUpdated = Effect.fnUntraced(function* (
  event: Extract<BrowserEvent, { _tag: "TabUpdated" }>,
) {
  const state = yield* KatipState
  const { changes, tab } = event
  // Not removing the Favorite: Chrome unpins a tab right before closing it, and before moving it
  // to another window, so an unpinning can't be told apart from closing the Favorite's tab, which
  // must keep the Favorite. A Favorite is removed only from Katip
  if (changes.pinned === false) yield* releaseFavoriteTab(tab.id)
  if (tab.pinned) {
    // A tab pinned in Chrome is a Favorite's, which belongs to no Space
    if (changes.pinned === true) {
      yield* state.workspace.update((workspace) => forgetTab(workspace, tab.id))
    }
    yield* adoptPinnedTab(tab)
    if (changes.title !== undefined) yield* refreshFavoriteTitle(tab)
    return
  }
  if (changes.url !== undefined) yield* settleProvisionalTab(tab)
  if (changes.pinned === false || changes.url !== undefined) yield* admitTab(tab)
  if (changes.url !== undefined) yield* placeOnceUrlIsKnown(tab)
})

/**
 * Applies a browser event to the record of which Space each tab belongs to.
 *
 * Bookmark events are left alone: bookmark changes are reconciled all at once instead.
 */
export const handleBrowserEvent = (event: BrowserEvent) =>
  Effect.gen(function* () {
    const state = yield* KatipState
    yield* Match.value(event).pipe(
      Match.tagsExhaustive({
        TabCreated: ({ tab }) =>
          Effect.andThen(admitCreatedTab(tab), tab.pinned ? adoptPinnedTab(tab) : Effect.void),
        TabUpdated: handleTabUpdated,
        TabRemoved: ({ tabId }) =>
          Effect.all(
            [
              forgetPendingTab(tabId),
              state.workspace.update((workspace) => forgetTab(workspace, tabId)),
              releaseFavoriteTab(tabId),
            ],
            { discard: true },
          ),
        TabReplaced: ({ addedTabId, removedTabId }) =>
          Effect.andThen(
            state.workspace.update((workspace) => replaceTab(workspace, removedTabId, addedTabId)),
            replaceFavoriteTab(removedTabId, addedTabId),
          ),
        TabActivated: ({ tabId, windowId }) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            state.workspace.update((workspace) =>
              recordActivation(workspace, { tabId, windowId, now }),
            ),
          ),
        WindowRemoved: ({ windowId }) =>
          state.workspace.update((workspace) => forgetWindow(workspace, windowId)),
        TabMoved: ({ tabId, windowId }) => followMovedFavoriteTab(tabId, windowId),
        TabAttached: () => Effect.void,
        TabDetached: () => Effect.void,
        TabGroupCreated: () => Effect.void,
        TabGroupUpdated: () => Effect.void,
        TabGroupRemoved: () => Effect.void,
        TabGroupMoved: () => Effect.void,
        WindowCreated: () => Effect.void,
        WindowFocusChanged: () => Effect.void,
        BookmarkCreated: () => Effect.void,
        BookmarkChanged: () => Effect.void,
        BookmarkMoved: () => Effect.void,
        BookmarkRemoved: () => Effect.void,
        BookmarkChildrenReordered: () => Effect.void,
        AlarmFired: () => Effect.void,
        CommandTriggered: () => Effect.void,
        RuntimeInstalled: () => Effect.void,
        RuntimeStartup: () => Effect.void,
      }),
    )
  })

export const isBookmarkEvent = (event: BrowserEvent) => event._tag.startsWith("Bookmark")
