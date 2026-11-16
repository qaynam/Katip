import { Clock, Effect, Match, Option } from "effect"
import {
  forgetTab,
  forgetWindow,
  recordActivation,
  replaceTab,
  switchSpace,
} from "#modules/workspace"
import type { BrowserEvent, BrowserTab, TabChanges, TabId, WindowId } from "#platform/browser"
import {
  adoptPinnedTab,
  followFavoritePinChange,
  followMovedFavoriteTab,
  refreshFavoriteTitle,
  releaseFavoriteTab,
  replaceFavoriteTab,
  restoreUnpinnedFavoriteTab,
  spaceOfFavoriteTab,
} from "./favorites"
import {
  admitCreatedTab,
  admitTab,
  admitUnpinnedTab,
  forgetPendingTab,
  settleProvisionalTab,
} from "./tab-admission"
import { KatipState } from "./katip-state"

const followTabUpdate = Effect.fnUntraced(function* (tab: BrowserTab, changes: TabChanges) {
  const state = yield* KatipState
  if (tab.pinned) {
    // A tab pinned in Chrome is a Favorite's, kept apart from its Space's other tabs
    if (changes.pinned === true) {
      yield* state.workspace.update((workspace) => forgetTab(workspace, tab.id))
    }
    yield* adoptPinnedTab(tab)
    if (changes.title !== undefined) yield* refreshFavoriteTitle(tab)
    return
  }
  if (changes.url !== undefined) {
    if (yield* restoreUnpinnedFavoriteTab(tab)) return
    yield* settleProvisionalTab(tab)
    yield* admitTab(tab)
  } else if (changes.pinned === false) {
    yield* admitUnpinnedTab(tab)
  }
})

// Not removing the Favorite when its tab is unpinned: Chrome unpins a tab right before closing it,
// and before moving it to another window, so an unpinning can't be told apart from closing the
// Favorite's tab, which must keep the Favorite. A Favorite is removed only from Katip
const handleTabUpdated = Effect.fnUntraced(function* (
  event: Extract<BrowserEvent, { _tag: "TabUpdated" }>,
) {
  const { changes, tab } = event
  if (Option.isNone(yield* spaceOfFavoriteTab(tab.id))) return yield* followTabUpdate(tab, changes)
  const released =
    changes.pinned === undefined ? Option.none<BrowserTab>() : yield* followFavoritePinChange(tab)
  if (Option.isSome(released)) return yield* followTabUpdate(released.value, changes)
  if (changes.title !== undefined) yield* refreshFavoriteTitle(tab)
})

const handleTabCreated = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (tab.pinned) {
    yield* admitCreatedTab(tab)
    yield* adoptPinnedTab(tab)
  } else if (!(yield* restoreUnpinnedFavoriteTab(tab))) {
    yield* admitCreatedTab(tab)
  }
})

// A Favorite's tab belongs to no Space as a tab does, but activating it shows its Favorite's Space
const handleTabActivated = Effect.fnUntraced(function* (activation: {
  readonly tabId: TabId
  readonly windowId: WindowId
}) {
  const state = yield* KatipState
  const now = yield* Clock.currentTimeMillis
  const favoriteSpace = yield* spaceOfFavoriteTab(activation.tabId)
  yield* state.workspace.update((workspace) =>
    Option.match(favoriteSpace, {
      onNone: () => recordActivation(workspace, { ...activation, now }),
      onSome: (spaceId) => switchSpace(workspace, activation.windowId, spaceId),
    }),
  )
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
        TabCreated: ({ tab }) => handleTabCreated(tab),
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
        TabActivated: handleTabActivated,
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
        NotificationClicked: () => Effect.void,
      }),
    )
  })

export const isBookmarkEvent = (event: BrowserEvent) => event._tag.startsWith("Bookmark")
