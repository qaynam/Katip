import { Array, Option, Order, pipe, Schema } from "effect"
import { SpaceId, type SpaceList } from "#modules/space"
import { BookmarkId, TabId, WindowId } from "#platform/browser"

export const PinnedBinding = Schema.Struct({
  bookmarkId: BookmarkId,
  // ブックマークの URL ではなく、ピン留めした時点の URL。ここから移動したかを判定する基準
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

// Chrome は Cmd+T で開いたタブにも直前のタブを opener として付けることがあるため、
// 新しいタブページについては opener を所属の手がかりにしない
const isNewTabPage = (url: string) =>
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
 * タブを指定した Space の一時タブとして所属させる。既に所属していれば移す。
 *
 * 所属の判定（固定タブや自拡張のページを除外する規則）は行わないので、
 * 由来の分かっているタブにだけ使う。
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
 * 削除される Space から、タブとウィンドウのアクティブ指定を引き継ぎ先へ移す。
 *
 * Space と一緒にブックマークも消えるため、ピンのバインディングは外す。
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
 * Space に切り替えたときに前面へ出すタブを選ぶ。その Space で最後に使っていたタブを優先する。
 *
 * @param candidates - 切り替えるウィンドウに今あるタブ。他のウィンドウのタブは選ばない。
 * @returns 該当するタブが無ければ none（呼び出し側で新しいタブを開く）。
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
