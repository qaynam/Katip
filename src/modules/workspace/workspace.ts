import { Array, Option, Order, pipe, Schema } from "effect"
import { SpaceId, type SpaceList } from "#modules/space"
import { BookmarkId, TabId, WindowId } from "#platform/browser"

export const PinnedBinding = Schema.Struct({
  bookmarkId: BookmarkId,
  // Not the bookmark's URL but the URL when pinned: whether the tab has moved away is judged from
  // this
  pinnedUrl: Schema.String,
})
export type PinnedBinding = typeof PinnedBinding.Type

export const TrackedTab = Schema.Struct({
  tabId: TabId,
  spaceId: SpaceId,
  pinned: Schema.NullOr(PinnedBinding),
  titleOverride: Schema.NullOr(Schema.String),
  lastActiveAt: Schema.Number,
})
export type TrackedTab = typeof TrackedTab.Type

export const WindowSpace = Schema.Struct({
  windowId: WindowId,
  activeSpaceId: SpaceId,
})
export type WindowSpace = typeof WindowSpace.Type

export const Workspace = Schema.Struct({
  tabs: Schema.Array(TrackedTab),
  windows: Schema.Array(WindowSpace),
})
export type Workspace = typeof Workspace.Type

export const emptyWorkspace: Workspace = { tabs: [], windows: [] }

export interface NewTab {
  readonly tabId: TabId
  readonly windowId: WindowId
  readonly url: string
  readonly openerTabId: Option.Option<TabId>
  readonly isChromePinned: boolean
}

export interface PlacementContext {
  readonly spaces: SpaceList
  readonly defaultSpaceId: Option.Option<SpaceId>
  readonly extensionOrigin: string
  readonly now: number
}

const findTab = (workspace: Workspace, tabId: TabId) =>
  Array.findFirst(workspace.tabs, (tab) => tab.tabId === tabId)

const updateTab = (
  workspace: Workspace,
  tabId: TabId,
  update: (tab: TrackedTab) => TrackedTab,
) => ({
  ...workspace,
  tabs: workspace.tabs.map((tab) => (tab.tabId === tabId ? update(tab) : tab)),
})

export const spaceOf = (workspace: Workspace, tabId: TabId): Option.Option<SpaceId> =>
  Option.map(findTab(workspace, tabId), (tab) => tab.spaceId)

export const trackedTab = (workspace: Workspace, tabId: TabId): Option.Option<TrackedTab> =>
  findTab(workspace, tabId)

export const activeSpaceOf = (workspace: Workspace, windowId: WindowId): Option.Option<SpaceId> =>
  pipe(
    Array.findFirst(workspace.windows, (window) => window.windowId === windowId),
    Option.map((window) => window.activeSpaceId),
  )

export const switchSpace = (
  workspace: Workspace,
  windowId: WindowId,
  spaceId: SpaceId,
): Workspace => ({
  ...workspace,
  windows: [
    ...workspace.windows.filter((window) => window.windowId !== windowId),
    { windowId, activeSpaceId: spaceId },
  ],
})

export const forgetWindow = (workspace: Workspace, windowId: WindowId): Workspace => ({
  ...workspace,
  windows: workspace.windows.filter((window) => window.windowId !== windowId),
})

/**
 * Whether `url` is a blank page that a new tab starts on, as opposed to a page the user opened.
 *
 * @remarks
 * Decided by URL, not by the opener: Chrome sometimes gives even a tab opened with Cmd+T the
 * previous tab as its opener.
 */
export const isNewTabPage = (url: string) =>
  url === "" ||
  url === "about:blank" ||
  url.startsWith("chrome://newtab") ||
  url.startsWith("chrome://new-tab-page")

const isTrackable = (tab: NewTab, extensionOrigin: string) =>
  !tab.isChromePinned && !tab.url.startsWith(extensionOrigin)

const chooseSpace = (
  workspace: Workspace,
  tab: NewTab,
  context: PlacementContext,
): Option.Option<SpaceId> => {
  const exists = (id: SpaceId) => context.spaces.some((space) => space.id === id)
  const fromOpener = isNewTabPage(tab.url)
    ? Option.none<SpaceId>()
    : Option.flatMap(tab.openerTabId, (opener) => spaceOf(workspace, opener))
  return pipe(
    fromOpener,
    Option.orElse(() => activeSpaceOf(workspace, tab.windowId)),
    Option.orElse(() => Option.filter(context.defaultSpaceId, exists)),
    Option.orElse(() => Option.map(Array.head(context.spaces), (space) => space.id)),
  )
}

export const trackTab = (
  workspace: Workspace,
  tab: NewTab,
  context: PlacementContext,
): Workspace => {
  if (!isTrackable(tab, context.extensionOrigin) || Option.isSome(findTab(workspace, tab.tabId))) {
    return workspace
  }
  return Option.match(chooseSpace(workspace, tab, context), {
    onNone: () => workspace,
    onSome: (spaceId) => assignTab(workspace, tab.tabId, spaceId, context.now),
  })
}

/**
 * Puts the tab in the given Space as a temporary tab, moving it if it already belongs to one.
 *
 * It skips the rules that decide whether a tab belongs anywhere (leaving out Chrome-pinned tabs and
 * Katip's own pages), so use it only for tabs whose origin is known.
 */
export const assignTab = (
  workspace: Workspace,
  tabId: TabId,
  spaceId: SpaceId,
  now: number,
): Workspace =>
  Option.isSome(findTab(workspace, tabId))
    ? updateTab(workspace, tabId, (tab) => ({ ...tab, spaceId }))
    : {
        ...workspace,
        tabs: [
          ...workspace.tabs,
          { tabId, spaceId, pinned: null, titleOverride: null, lastActiveAt: now },
        ],
      }

export const moveTabToSpace = (workspace: Workspace, tabId: TabId, spaceId: SpaceId): Workspace =>
  updateTab(workspace, tabId, (tab) => ({ ...tab, spaceId }))

export const forgetTab = (workspace: Workspace, tabId: TabId): Workspace => ({
  ...workspace,
  tabs: workspace.tabs.filter((tab) => tab.tabId !== tabId),
})

export const replaceTab = (workspace: Workspace, oldTabId: TabId, newTabId: TabId): Workspace =>
  updateTab(forgetTab(workspace, newTabId), oldTabId, (tab) => ({ ...tab, tabId: newTabId }))

export const recordActivation = (
  workspace: Workspace,
  activation: { readonly tabId: TabId; readonly windowId: WindowId; readonly now: number },
): Workspace =>
  Option.match(findTab(workspace, activation.tabId), {
    onNone: () => workspace,
    onSome: (tab) =>
      switchSpace(
        updateTab(workspace, tab.tabId, (tracked) => ({
          ...tracked,
          lastActiveAt: activation.now,
        })),
        activation.windowId,
        tab.spaceId,
      ),
  })

export const bindPinned = (workspace: Workspace, tabId: TabId, binding: PinnedBinding) =>
  updateTab(workspace, tabId, (tab) => ({ ...tab, pinned: binding }))

export const unbindPinned = (workspace: Workspace, tabId: TabId) =>
  updateTab(workspace, tabId, (tab) => ({ ...tab, pinned: null }))

export const unbindBookmark = (workspace: Workspace, bookmarkId: BookmarkId): Workspace => ({
  ...workspace,
  tabs: workspace.tabs.map((tab) =>
    tab.pinned?.bookmarkId === bookmarkId ? { ...tab, pinned: null } : tab,
  ),
})

export const tabsBoundTo = (workspace: Workspace, bookmarkId: BookmarkId) =>
  workspace.tabs.filter((tab) => tab.pinned?.bookmarkId === bookmarkId)

export const setTitleOverride = (
  workspace: Workspace,
  tabId: TabId,
  title: Option.Option<string>,
) => updateTab(workspace, tabId, (tab) => ({ ...tab, titleOverride: Option.getOrNull(title) }))

/**
 * Moves the tabs of a Space being deleted, and the windows that had it active, to the successor.
 *
 * The Space's bookmarks go with it, so the moved tabs lose their pin bindings.
 */
export const releaseSpace = (
  workspace: Workspace,
  released: SpaceId,
  successor: SpaceId,
): Workspace => ({
  tabs: workspace.tabs.map((tab) =>
    tab.spaceId === released ? { ...tab, spaceId: successor, pinned: null } : tab,
  ),
  windows: workspace.windows.map((window) =>
    window.activeSpaceId === released ? { ...window, activeSpaceId: successor } : window,
  ),
})

const byLastActive = Order.mapInput(Order.Number, (tab: TrackedTab) => tab.lastActiveAt)

/**
 * Picks the tab to bring forward on switching to a Space: the one last used in that Space.
 *
 * @param candidates - The tabs now in the window being switched. Tabs in other windows are never
 *   picked.
 * @returns None when no candidate belongs to the Space (the caller opens a new tab).
 */
export const tabToFocus = (
  workspace: Workspace,
  spaceId: SpaceId,
  candidates: ReadonlyArray<TabId>,
): Option.Option<TabId> =>
  pipe(
    workspace.tabs.filter((tab) => tab.spaceId === spaceId && candidates.includes(tab.tabId)),
    Array.match({
      onEmpty: () => Option.none(),
      onNonEmpty: (tabs) => Option.some(Array.max(tabs, byLastActive).tabId),
    }),
  )
