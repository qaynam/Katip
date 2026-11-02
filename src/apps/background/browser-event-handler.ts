import { Clock, Effect, Match } from "effect"
import { forgetTab, forgetWindow, recordActivation, replaceTab } from "#modules/workspace"
import type { BrowserEvent } from "#platform/browser"
import { admitTab, forgetProvisionalTab, settleProvisionalTab } from "./tab-admission"
import { KatipState } from "./katip-state"

const handleTabUpdated = Effect.fnUntraced(function* (
  event: Extract<BrowserEvent, { _tag: "TabUpdated" }>,
) {
  const state = yield* KatipState
  const { changes, tab } = event
  if (changes.pinned === true) {
    // A tab pinned in Chrome becomes a Favorite, which belongs to no Space
    yield* state.workspace.update((workspace) => forgetTab(workspace, tab.id))
    return
  }
  if (changes.url !== undefined) yield* settleProvisionalTab(tab)
  if (changes.pinned === false || changes.url !== undefined) yield* admitTab(tab)
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
        TabCreated: ({ tab }) => admitTab(tab),
        TabUpdated: handleTabUpdated,
        TabRemoved: ({ tabId }) =>
          Effect.andThen(
            forgetProvisionalTab(tabId),
            state.workspace.update((workspace) => forgetTab(workspace, tabId)),
          ),
        TabReplaced: ({ addedTabId, removedTabId }) =>
          state.workspace.update((workspace) => replaceTab(workspace, removedTabId, addedTabId)),
        TabActivated: ({ tabId, windowId }) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            state.workspace.update((workspace) =>
              recordActivation(workspace, { tabId, windowId, now }),
            ),
          ),
        WindowRemoved: ({ windowId }) =>
          state.workspace.update((workspace) => forgetWindow(workspace, windowId)),
        TabMoved: () => Effect.void,
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
