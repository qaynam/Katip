import { Array, Clock, Effect, Equal, Match, Option, Order, Schema } from "effect"
import { ArchiveRepository } from "#modules/archive"
import {
  defaultLiveFolderTitle,
  GitHubTokenStore,
  LiveFolders,
  type LiveSort,
  type LiveSource,
} from "#modules/live-folders"
import {
  FolderExpansionStore,
  FolderIconStore,
  LiveFolderStore,
  liveFoldersIn,
  PinnedBookmarks,
  PinnedParent,
  SpaceFolders,
  type FolderIcon,
  type FolderNestingRule,
  type PinnedNode,
  type PinnedPosition,
  type PinnedSplit,
} from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import {
  addSpace,
  nextSpaceName,
  moveSpace,
  removeSpace,
  renameSpace,
  setSpaceTheme,
  type Space,
  type SpaceId,
} from "#modules/space"
import { moveIndexFor } from "#modules/tab-order"
import { settleTheme } from "#modules/theme"
import {
  activeSpaceOf,
  assignTab,
  bindPinned,
  moveTabToSpace,
  releaseSpace,
  setTitleOverride,
  spaceOf,
  switchSpace,
  tabsBoundTo,
  tabToFocus,
  trackedTab,
  unbindBookmark,
  unbindPinned,
  type TrackedTab,
  type Workspace,
} from "#modules/workspace"
import {
  Tabs,
  type BookmarkId,
  type BrowserTab,
  type SplitViewId,
  type TabId,
  type WindowId,
} from "#platform/browser"
import type { CommandOutcome, PinnedPlacement, SidebarCommand, TemporaryPlacement } from "#protocol"
import { pruneStaleBindings } from "./bindings"
import { ExtensionInfo } from "./extension-info"
import { newSpaceId } from "./initialize"
import { KatipState } from "./katip-state"
import { openSpotlight } from "./spotlight-window"
import { refreshLiveFoldersWhere, scheduleLiveFolderRefresh } from "./live-folder-refresh"
import { urlOf } from "./tab-admission"
import {
  currentTranslator,
  numberedSpaceName,
  type PlainMessageKey,
  translate,
} from "./translation"

export class CommandRejected extends Schema.TaggedError<CommandRejected>()("CommandRejected", {
  reason: Schema.String,
}) {}

const reject = (key: PlainMessageKey) =>
  Effect.flatMap(translate(key), (reason) => Effect.fail(new CommandRejected({ reason })))

const findSpace = Effect.fnUntraced(function* (spaceId: SpaceId) {
  const spaces = yield* (yield* KatipState).spaces.get
  return yield* Option.match(
    Array.findFirst(spaces, (space) => space.id === spaceId),
    { onNone: () => reject("background.space.notFound"), onSome: Effect.succeed },
  )
})

const trackedOrReject = Effect.fnUntraced(function* (tabId: TabId) {
  const workspace = yield* (yield* KatipState).workspace.get
  return yield* Option.match(trackedTab(workspace, tabId), {
    onNone: () => reject("background.tab.notInSpace"),
    onSome: Effect.succeed,
  })
})

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const titleOf = (tab: BrowserTab) => Option.getOrElse(tab.title, () => urlOf(tab))

// Switching Spaces brings a tab of the new Space to the front, or opens a new tab if it has none.
// Otherwise the side panel would show the new Space while the browser kept showing a tab of the
// previous one, and it would be unclear which is right
const switchToSpace = Effect.fnUntraced(function* (windowId: WindowId, spaceId: SpaceId) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const workspace = yield* state.workspace.update((current) =>
    switchSpace(current, windowId, spaceId),
  )
  const candidates = (yield* tabs.query({ windowId }))
    .filter((tab) => !tab.pinned)
    .map((tab) => tab.id)
  yield* Option.match(tabToFocus(workspace, spaceId, candidates), {
    onSome: (tabId) => tabs.update(tabId, { active: true }),
    onNone: () => tabs.create({ windowId, active: true }),
  })
})

const spaceCommands = {
  SwitchSpace: ({ windowId, spaceId }: { windowId: WindowId; spaceId: SpaceId }) =>
    switchToSpace(windowId, spaceId),

  CreateSpace: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "CreateSpace" }>,
  ) {
    const state = yield* KatipState
    const id = yield* newSpaceId
    const numbered = yield* numberedSpaceName
    const spaces = yield* state.spaces.update((current) =>
      addSpace(current, {
        id,
        name: command.name ?? nextSpaceName(current, numbered),
        ...(command.theme !== undefined && { theme: settleTheme(command.theme) }),
      }),
    )
    const created = spaces.find((space) => space.id === id) as Space
    yield* (yield* SpaceFolders).ensureSpaceFolder(created)
    yield* switchToSpace(command.windowId, id)
  }),

  RenameSpace: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "RenameSpace" }>,
  ) {
    yield* (yield* KatipState).spaces.updateEffect((spaces) =>
      Effect.fromResult(renameSpace(spaces, command.spaceId, command.name)),
    )
    yield* (yield* SpaceFolders).renameSpaceFolder({ id: command.spaceId, name: command.name })
  }),

  SetSpaceTheme: (command: Extract<SidebarCommand, { _tag: "SetSpaceTheme" }>) =>
    KatipState.use((state) =>
      state.spaces.updateEffect((spaces) =>
        Effect.fromResult(setSpaceTheme(spaces, command.spaceId, settleTheme(command.theme))),
      ),
    ),

  // Pinned tabs go with the Space, bookmarks and all, but open temporary tabs aren't closed: they
  // move to a remaining Space. Closing them would lose pages in use without asking
  DeleteSpace: Effect.fnUntraced(function* ({ spaceId }: { spaceId: SpaceId }) {
    const state = yield* KatipState
    const successor = Array.findFirst(yield* state.spaces.get, (space) => space.id !== spaceId)
    if (Option.isNone(successor)) return yield* reject("background.space.lastOne")
    const liveFolderIds = yield* (yield* PinnedBookmarks).loadSpaceTree(spaceId).pipe(
      Effect.map((tree) => liveFoldersIn(tree).map((live) => live.id)),
      Effect.orElseSucceed((): ReadonlyArray<BookmarkId> => []),
    )
    yield* state.spaces.updateEffect((spaces) => Effect.fromResult(removeSpace(spaces, spaceId)))
    yield* state.workspace.update((workspace) =>
      releaseSpace(workspace, spaceId, successor.value.id),
    )
    yield* (yield* SpaceFolders).removeSpaceFolder(spaceId)
    yield* (yield* LiveFolderStore).forget(liveFolderIds)
    yield* releaseLiveFolders(liveFolderIds)
  }),

  MoveSpace: ({ spaceId, toIndex }: { spaceId: SpaceId; toIndex: number }) =>
    KatipState.use((state) =>
      state.spaces.updateEffect((spaces) => Effect.fromResult(moveSpace(spaces, spaceId, toIndex))),
    ),
}

/** Drops the running refreshes and the cache of live folders removed from the bookmarks. */
const releaseLiveFolders = Effect.fnUntraced(function* (folderIds: ReadonlyArray<BookmarkId>) {
  if (folderIds.length === 0) return
  yield* (yield* LiveFolders).forget(folderIds)
  yield* scheduleLiveFolderRefresh
})

const unpinFromChrome = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (tab.pinned) yield* (yield* Tabs).update(tab.id, { pinned: false })
})

// Not one half of a split pin alone: the remaining bookmark would be left behind as a plain
// folder. Unpinning a tab of a split pin removes the whole split pin and makes both tabs temporary
const removePin = Effect.fnUntraced(function* (tracked: TrackedTab) {
  if (tracked.pinned === null) return
  const state = yield* KatipState
  const pinned = yield* PinnedBookmarks
  const { bookmarkId } = tracked.pinned
  const splitFolder = yield* pinned.locate(bookmarkId).pipe(
    Effect.flatMap((location) =>
      Option.match(location.parentFolderId, {
        onNone: () => Effect.succeedNone,
        onSome: (parentId) =>
          Effect.map(pinned.locate(parentId), (parent) =>
            parent.node._tag === "PinnedSplit" ? Option.some(parent.node) : Option.none(),
          ),
      }),
    ),
    Effect.catchTag("PinnedNodeNotFound", () => Effect.succeedNone),
  )
  if (Option.isSome(splitFolder)) {
    yield* pinned.removeBookmark(splitFolder.value.id)
    yield* state.workspace.update((workspace) =>
      splitFolder.value.items.reduce((acc, item) => unbindBookmark(acc, item.id), workspace),
    )
    return
  }
  yield* pinned
    .removeBookmark(bookmarkId)
    .pipe(Effect.catchTag("PinnedNodeNotFound", () => Effect.void))
  yield* state.workspace.update((workspace) => unbindPinned(workspace, tracked.tabId))
})

const splitPartnersIn = (windowTabs: ReadonlyArray<BrowserTab>) => (tabId: TabId) => {
  const splitViewId = windowTabs.find((tab) => tab.id === tabId)?.splitViewId ?? Option.none()
  return Option.match(splitViewId, {
    onNone: () => [tabId],
    onSome: (id) =>
      windowTabs.filter((tab) => Option.contains(tab.splitViewId, id)).map((tab) => tab.id),
  })
}

/**
 * Makes the tabs (two for a split view) temporary tabs of the Space, and moves them to the given
 * position in display order. Unpins them if they're pinned, in Katip or in Chrome.
 */
const placeInTemporary = Effect.fnUntraced(function* (
  tabIds: ReadonlyArray<TabId>,
  spaceId: SpaceId,
  placement: TemporaryPlacement,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const settings = yield* (yield* SettingsRepository).get
  const moving = Array.sort(yield* Effect.forEach(tabIds, (tabId) => tabs.get(tabId)), byIndex)
  const [first] = moving
  if (first === undefined) return
  yield* Effect.forEach(moving, unpinFromChrome, { discard: true })
  // Re-read for each tab: unpinning the first tab of a split pin already unpins both
  yield* Effect.forEach(
    moving,
    (tab) =>
      Effect.flatMap(state.workspace.get, (current) =>
        Option.match(trackedTab(current, tab.id), { onNone: () => Effect.void, onSome: removePin }),
      ),
    { discard: true },
  )
  const now = yield* Clock.currentTimeMillis
  const workspace = yield* state.workspace.update((current) =>
    moving.reduce((acc, tab) => assignTab(acc, tab.id, spaceId, now), current),
  )
  const windowTabs = Array.sort(yield* tabs.query({ windowId: first.windowId }), byIndex)
  const spaceTabs = windowTabs
    .filter((candidate) =>
      Option.exists(
        trackedTab(workspace, candidate.id),
        (tracked) => tracked.spaceId === spaceId && tracked.pinned === null,
      ),
    )
    .map((candidate) => candidate.id)
  const index = moveIndexFor({
    windowTabs: windowTabs.map((candidate) => candidate.id),
    spaceTabs,
    moving: moving.map((tab) => tab.id),
    placement,
    newestOnTop: settings.newTabsOnTop,
    unitOf: splitPartnersIn(windowTabs),
  })
  if (Option.isNone(index)) return
  yield* tabs.move(
    moving.map((tab) => tab.id),
    { index: index.value },
  )
  yield* resplitIfBroken(moving)
})

// Whether a split view survives moving both of its tabs together depends on the Chrome version.
// If it came apart, the tabs are still side by side, so the split is made again
const resplitIfBroken = Effect.fnUntraced(function* (moved: ReadonlyArray<BrowserTab>) {
  const [left, right] = moved
  if (left === undefined || right === undefined || Option.isNone(left.splitViewId)) return
  const tabs = yield* Tabs
  const current = yield* tabs.get(left.id)
  if (Option.isSome(current.splitViewId)) return
  yield* tabs.createSplit([left.id, right.id])
})

const pinnedPosition = Effect.fnUntraced(function* (
  placement: PinnedPlacement,
): Effect.fn.Return<PinnedPosition, CommandRejected, KatipState | SettingsRepository> {
  const space = yield* findSpace(placement.spaceId)
  return {
    parent:
      placement.parentId === null
        ? PinnedParent.SpaceRoot({ space })
        : PinnedParent.Folder({ folderId: placement.parentId }),
    index: placement.index,
  }
})

const currentNestingRule = Effect.map(
  SettingsRepository.use((settings) => settings.get),
  (settings): FolderNestingRule => ({ isTabGroupSyncEnabled: settings.syncTabGroups }),
)

const movePinnedNode = Effect.fnUntraced(function* (
  bookmarkId: BookmarkId,
  position: PinnedPosition,
) {
  yield* (yield* PinnedBookmarks).moveNode(bookmarkId, position, yield* currentNestingRule)
})

const placeInPinned = Effect.fnUntraced(function* (
  tabId: TabId,
  spaceId: SpaceId,
  position: PinnedPosition,
) {
  const state = yield* KatipState
  const pinned = yield* PinnedBookmarks
  const tab = yield* (yield* Tabs).get(tabId)
  yield* unpinFromChrome(tab)
  const now = yield* Clock.currentTimeMillis
  const binding = Option.flatMap(trackedTab(yield* state.workspace.get, tabId), (tracked) =>
    Option.fromNullishOr(tracked.pinned),
  )
  if (Option.isSome(binding)) {
    yield* movePinnedNode(binding.value.bookmarkId, position)
  } else {
    const url = urlOf(tab)
    const bookmarkId = yield* pinned.createBookmark(position, { title: titleOf(tab), url })
    yield* state.workspace.update((workspace) =>
      bindPinned(assignTab(workspace, tabId, spaceId, now), tabId, { bookmarkId, pinnedUrl: url }),
    )
  }
  yield* state.workspace.update((workspace) => assignTab(workspace, tabId, spaceId, now))
})

/** The IDs of the bookmarks in the node and below it that an open tab can be bound to. */
const pinnedIdsOf = (node: PinnedNode): ReadonlyArray<BookmarkId> =>
  Match.valueTags(node, {
    PinnedBookmark: ({ id }): ReadonlyArray<BookmarkId> => [id],
    PinnedSplit: ({ items }) => items.map((item) => item.id),
    PinnedLiveFolder: () => [],
    PinnedFolder: ({ children }) => children.flatMap(pinnedIdsOf),
  })

const requireSplitSupport = Tabs.use((tabs) =>
  tabs.supportsSplitView ? Effect.void : reject("background.split.unsupported"),
)

const splitPairOf = Effect.fnUntraced(function* (splitViewId: SplitViewId) {
  const pair = Array.sort(
    (yield* (yield* Tabs).query({})).filter((tab) => Option.contains(tab.splitViewId, splitViewId)),
    byIndex,
  )
  const [left, right] = pair
  if (left === undefined || right === undefined) {
    return yield* reject("background.split.notFound")
  }
  return [left, right] as const
})

const pinOf = (workspace: Workspace, tab: BrowserTab) =>
  Option.flatMap(trackedTab(workspace, tab.id), (tracked) => Option.fromNullishOr(tracked.pinned))

// The ID of the split pin's folder, if the two tabs are bound to its two sides
const sharedSplitPin = Effect.fnUntraced(function* (left: BrowserTab, right: BrowserTab) {
  const workspace = yield* (yield* KatipState).workspace.get
  const pinned = yield* PinnedBookmarks
  const [leftPin, rightPin] = [pinOf(workspace, left), pinOf(workspace, right)]
  if (Option.isNone(leftPin) || Option.isNone(rightPin)) return Option.none<BookmarkId>()
  const parent = (yield* pinned.locate(leftPin.value.bookmarkId)).parentFolderId
  if (Option.isNone(parent)) return Option.none<BookmarkId>()
  const split = (yield* pinned.locate(parent.value)).node
  return split._tag === "PinnedSplit" &&
    split.items.some((item) => item.id === rightPin.value.bookmarkId)
    ? Option.some(split.id)
    : Option.none<BookmarkId>()
})

// Opens only the closed side, in a split view beside the open one. If both are open, only brings
// them to the front
const openSplitPin = Effect.fnUntraced(function* (
  windowId: WindowId,
  spaceId: SpaceId,
  split: PinnedSplit,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const windowTabIds = new Set<TabId>((yield* tabs.query({ windowId })).map((tab) => tab.id))
  const workspace = yield* state.workspace.get
  const openTabOf = (bookmarkId: BookmarkId) =>
    Option.fromNullishOr(
      tabsBoundTo(workspace, bookmarkId).find((tab) => windowTabIds.has(tab.tabId)),
    )
  const [leftPin, rightPin] = split.items
  const left = yield* Option.match(openTabOf(leftPin.id), {
    onSome: (tab) => tabs.update(tab.tabId, { active: true }),
    onNone: () => tabs.create({ windowId, url: leftPin.url, active: true }),
  })
  const canSplitWithLeft = tabs.supportsSplitView && Option.isNone(left.splitViewId)
  const right = yield* Option.match(openTabOf(rightPin.id), {
    onSome: (tab) => tabs.get(tab.tabId),
    onNone: () =>
      tabs.create({
        windowId,
        url: rightPin.url,
        active: false,
        ...(canSplitWithLeft && { splitWithTabId: left.id }),
      }),
  })
  const now = yield* Clock.currentTimeMillis
  const bind = (current: Workspace, tab: BrowserTab, pin: PinnedSplit["items"][number]) =>
    bindPinned(assignTab(current, tab.id, spaceId, now), tab.id, {
      bookmarkId: pin.id,
      pinnedUrl: pin.url,
    })
  yield* state.workspace.update((current) => bind(bind(current, left, leftPin), right, rightPin))
})

const pinSplit = Effect.fnUntraced(function* (
  splitViewId: SplitViewId,
  spaceId: SpaceId,
  position: PinnedPosition,
) {
  const state = yield* KatipState
  const pinned = yield* PinnedBookmarks
  const [left, right] = yield* splitPairOf(splitViewId)
  const existing = yield* sharedSplitPin(left, right)
  if (Option.isSome(existing)) {
    yield* movePinnedNode(existing.value, position)
  } else {
    // Tabs pinned separately lose those two pins, which become one split pin
    yield* Effect.forEach(
      [left, right],
      (tab) =>
        Effect.flatMap(state.workspace.get, (workspace) =>
          Option.match(trackedTab(workspace, tab.id), {
            onNone: () => Effect.void,
            onSome: removePin,
          }),
        ),
      { discard: true },
    )
    const created = yield* pinned.createSplit(position, {
      title: `${titleOf(left)} | ${titleOf(right)}`,
      left: { title: titleOf(left), url: urlOf(left) },
      right: { title: titleOf(right), url: urlOf(right) },
    })
    yield* state.workspace.update((current) =>
      bindPinned(
        bindPinned(current, left.id, { bookmarkId: created.left, pinnedUrl: urlOf(left) }),
        right.id,
        { bookmarkId: created.right, pinnedUrl: urlOf(right) },
      ),
    )
  }
  const now = yield* Clock.currentTimeMillis
  yield* state.workspace.update((current) =>
    [left, right].reduce((acc, tab) => assignTab(acc, tab.id, spaceId, now), current),
  )
})

const splitCommands = {
  SplitTabs: Effect.fnUntraced(function* ({
    tabId,
    withTabId,
  }: {
    tabId: TabId
    withTabId: TabId
  }) {
    yield* requireSplitSupport
    if (tabId === withTabId) return
    const state = yield* KatipState
    const tabs = yield* Tabs
    const target = yield* tabs.get(withTabId)
    const dragged = yield* tabs.get(tabId)
    if (target.pinned) return yield* reject("background.split.withFavorite")
    if (Option.isSome(target.splitViewId)) return yield* reject("background.split.alreadySplit")
    if (dragged.windowId !== target.windowId) {
      return yield* reject("background.split.otherWindow")
    }
    if (Option.isSome(dragged.splitViewId)) yield* tabs.unsplit(dragged.splitViewId.value)
    yield* unpinFromChrome(dragged)
    yield* Option.match(trackedTab(yield* state.workspace.get, tabId), {
      onNone: () => Effect.void,
      onSome: removePin,
    })
    const targetSpace = spaceOf(yield* state.workspace.get, withTabId)
    const now = yield* Clock.currentTimeMillis
    if (Option.isSome(targetSpace)) {
      yield* state.workspace.update((workspace) =>
        assignTab(workspace, tabId, targetSpace.value, now),
      )
    }
    // Only tabs in the same group can form a split view, so the groups are matched first
    const current = yield* tabs.get(tabId)
    if (!Equal.equals(current.groupId, target.groupId)) {
      yield* Option.match(target.groupId, {
        onSome: (groupId) => tabs.group({ tabIds: [tabId], groupId }),
        onNone: () => tabs.ungroup([tabId]),
      })
    }
    const remaining = Array.sort(yield* tabs.query({ windowId: target.windowId }), byIndex).filter(
      (tab) => tab.id !== tabId,
    )
    const targetPosition = remaining.findIndex((tab) => tab.id === withTabId)
    yield* tabs.move([tabId], { index: targetPosition + 1 })
    yield* tabs.createSplit([withTabId, tabId])
    // A split view is only on screen while one of its tabs is shown. The dragged tab is brought to
    // the front so the split is visible even when it was dropped while another tab was shown
    yield* tabs.update(tabId, { active: true })
  }),

  Unsplit: ({ splitViewId }: { splitViewId: SplitViewId }) =>
    Tabs.use((tabs) => tabs.unsplit(splitViewId)),

  PlaceSplitInTemporary: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "PlaceSplitInTemporary" }>,
  ) {
    const [left, right] = yield* splitPairOf(command.splitViewId)
    yield* placeInTemporary([left.id, right.id], command.spaceId, command.placement)
  }),

  PlaceSplitInPinned: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "PlaceSplitInPinned" }>,
  ) {
    yield* pinSplit(
      command.splitViewId,
      command.placement.spaceId,
      yield* pinnedPosition(command.placement),
    )
  }),
}

const tabCommands = {
  OpenNewTab: ({ windowId }: { windowId: WindowId }) =>
    Tabs.use((tabs) => tabs.create({ windowId, active: true })),

  ActivateTab: ({ tabId }: { tabId: TabId }) =>
    Tabs.use((tabs) => tabs.update(tabId, { active: true })),

  CloseTab: ({ tabId }: { tabId: TabId }) => Tabs.use((tabs) => tabs.remove([tabId])),

  // Not an override for a pinned tab: a pin's name is its bookmark's title, so the bookmark is
  // renamed. An empty name goes back to the page's title, as removing an override does
  RenameTab: Effect.fnUntraced(function* ({ tabId, title }: { tabId: TabId; title: string }) {
    const state = yield* KatipState
    const tracked = yield* trackedOrReject(tabId)
    const trimmed = title.trim()
    if (tracked.pinned !== null) {
      const name = trimmed === "" ? titleOf(yield* (yield* Tabs).get(tabId)) : trimmed
      return yield* (yield* PinnedBookmarks).rename(tracked.pinned.bookmarkId, name)
    }
    yield* state.workspace.update((workspace) =>
      setTitleOverride(
        workspace,
        tabId,
        Option.liftPredicate(trimmed, (value) => value !== ""),
      ),
    )
  }),

  MoveTabToSpace: Effect.fnUntraced(function* ({
    tabId,
    spaceId,
  }: {
    tabId: TabId
    spaceId: SpaceId
  }) {
    const state = yield* KatipState
    const tabs = yield* Tabs
    const space = yield* findSpace(spaceId)
    const tracked = yield* trackedOrReject(tabId)
    if (tracked.pinned !== null) {
      yield* movePinnedNode(tracked.pinned.bookmarkId, {
        parent: PinnedParent.SpaceRoot({ space }),
      })
    }
    const tab = yield* tabs.get(tabId)
    yield* state.workspace.update((workspace) =>
      switchSpace(moveTabToSpace(workspace, tabId, spaceId), tab.windowId, spaceId),
    )
    yield* tabs.update(tabId, { active: true })
  }),

  PlaceTabInTemporary: (command: Extract<SidebarCommand, { _tag: "PlaceTabInTemporary" }>) =>
    placeInTemporary([command.tabId], command.spaceId, command.placement),

  PlaceTabInPinned: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "PlaceTabInPinned" }>,
  ) {
    const position = yield* pinnedPosition(command.placement)
    yield* placeInPinned(command.tabId, command.placement.spaceId, position)
  }),

  PinTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const tracked = yield* trackedOrReject(tabId)
    // Not one tab of a split view alone: the other would stay temporary, and no split pin forms
    const { splitViewId } = yield* (yield* Tabs).get(tabId)
    const space = yield* findSpace(tracked.spaceId)
    const atEnd: PinnedPosition = { parent: PinnedParent.SpaceRoot({ space }) }
    if (Option.isSome(splitViewId)) return yield* pinSplit(splitViewId.value, space.id, atEnd)
    yield* placeInPinned(tabId, tracked.spaceId, atEnd)
  }),

  UnpinTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    yield* removePin(yield* trackedOrReject(tabId))
  }),

  CloseTemporaryTabs: Effect.fnUntraced(function* ({
    windowId,
    spaceId,
  }: {
    windowId: WindowId
    spaceId: SpaceId
  }) {
    const tabs = yield* Tabs
    const workspace = yield* (yield* KatipState).workspace.get
    const closing = (yield* tabs.query({ windowId }))
      .filter((tab) =>
        Option.exists(
          trackedTab(workspace, tab.id),
          (tracked) => tracked.spaceId === spaceId && tracked.pinned === null,
        ),
      )
      .map((tab) => tab.id)
    if (closing.length > 0) yield* tabs.remove(closing)
  }),

  ArchiveTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const tabs = yield* Tabs
    const tracked = yield* trackedOrReject(tabId)
    const tab = yield* tabs.get(tabId)
    yield* (yield* ArchiveRepository).add({
      url: urlOf(tab),
      title: titleOf(tab),
      spaceId: tracked.spaceId,
    })
    yield* tabs.remove([tabId])
  }),

  AddToFavorites: Effect.fnUntraced(function* ({ tabId, index }: { tabId: TabId; index?: number }) {
    const tabs = yield* Tabs
    yield* tabs.update(tabId, { pinned: true })
    if (index !== undefined) yield* tabs.move([tabId], { index })
  }),

  MoveFavorite: ({ tabId, toIndex }: { tabId: TabId; toIndex: number }) =>
    Tabs.use((tabs) => tabs.move([tabId], { index: toIndex })),
}

const bindingOf = (tracked: TrackedTab) =>
  Option.match(Option.fromNullishOr(tracked.pinned), {
    onNone: () => reject("background.tab.notPinned"),
    onSome: Effect.succeed,
  })

const pinnedCommands = {
  OpenPinnedItem: Effect.fnUntraced(function* ({
    windowId,
    bookmarkId,
  }: {
    windowId: WindowId
    bookmarkId: BookmarkId
  }) {
    const state = yield* KatipState
    const tabs = yield* Tabs
    const location = yield* (yield* PinnedBookmarks).locate(bookmarkId)
    if (location.node._tag === "PinnedFolder" || location.node._tag === "PinnedLiveFolder") {
      return yield* reject("background.folder.cannotOpen")
    }
    if (location.node._tag === "PinnedSplit") {
      return yield* openSplitPin(windowId, location.spaceId, location.node)
    }
    const windowTabIds = new Set<TabId>((yield* tabs.query({ windowId })).map((tab) => tab.id))
    const opened = tabsBoundTo(yield* state.workspace.get, bookmarkId).find((tab) =>
      windowTabIds.has(tab.tabId),
    )
    if (opened !== undefined) return yield* tabs.update(opened.tabId, { active: true })
    const url = location.node.url
    const tab = yield* tabs.create({ windowId, url, active: true })
    const now = yield* Clock.currentTimeMillis
    yield* state.workspace.update((workspace) =>
      bindPinned(assignTab(workspace, tab.id, location.spaceId, now), tab.id, {
        bookmarkId,
        pinnedUrl: url,
      }),
    )
  }),

  MovePinnedItem: Effect.fnUntraced(function* ({
    bookmarkId,
    placement,
  }: {
    bookmarkId: BookmarkId
    placement: PinnedPlacement
  }) {
    const state = yield* KatipState
    const pinned = yield* PinnedBookmarks
    const boundIds = pinnedIdsOf((yield* pinned.locate(bookmarkId)).node)
    yield* movePinnedNode(bookmarkId, yield* pinnedPosition(placement)).pipe(
      Effect.catchTag("FolderDepthExceeded", () => reject("background.folder.tooDeepToMove")),
    )
    yield* state.workspace.update((workspace) =>
      boundIds
        .flatMap((id) => tabsBoundTo(workspace, id))
        .reduce((acc, tab) => moveTabToSpace(acc, tab.tabId, placement.spaceId), workspace),
    )
  }),

  RemovePinnedItem: Effect.fnUntraced(function* ({ bookmarkId }: { bookmarkId: BookmarkId }) {
    const pinned = yield* PinnedBookmarks
    const { node } = yield* pinned.locate(bookmarkId)
    yield* pinned.removeBookmark(bookmarkId)
    yield* (yield* KatipState).workspace.update((workspace) =>
      pinnedIdsOf(node).reduce(unbindBookmark, workspace),
    )
    if (node._tag === "PinnedLiveFolder") yield* releaseLiveFolders([bookmarkId])
  }),

  RenamePinnedItem: Effect.fnUntraced(function* ({
    bookmarkId,
    title,
  }: {
    bookmarkId: BookmarkId
    title: string
  }) {
    const trimmed = title.trim()
    if (trimmed === "") return yield* reject("background.name.required")
    yield* (yield* PinnedBookmarks).rename(bookmarkId, trimmed)
  }),

  ResetPinnedTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const binding = yield* bindingOf(yield* trackedOrReject(tabId))
    yield* (yield* Tabs).update(tabId, { url: binding.pinnedUrl })
  }),

  // Only the URL is replaced with the current page's: the pin's name is the user's own
  ReplacePinnedUrl: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const state = yield* KatipState
    const pinned = yield* PinnedBookmarks
    const binding = yield* bindingOf(yield* trackedOrReject(tabId))
    const url = urlOf(yield* (yield* Tabs).get(tabId))
    const location = yield* pinned.locate(binding.bookmarkId)
    yield* pinned.updateBookmark(binding.bookmarkId, { title: location.node.title, url })
    yield* state.workspace.update((workspace) =>
      bindPinned(workspace, tabId, { bookmarkId: binding.bookmarkId, pinnedUrl: url }),
    )
  }),

  CreateFolder: Effect.fnUntraced(function* ({
    spaceId,
    parentId,
  }: {
    spaceId: SpaceId
    parentId: BookmarkId | null
  }) {
    const position = yield* pinnedPosition({ spaceId, parentId, index: Number.MAX_SAFE_INTEGER })
    return yield* (yield* PinnedBookmarks).createFolder(
      { parent: position.parent },
      { title: yield* translate("common.newFolder") },
      yield* currentNestingRule,
    )
  }),

  SetFolderExpanded: ({
    bookmarkId,
    isExpanded,
  }: {
    bookmarkId: BookmarkId
    isExpanded: boolean
  }) => FolderExpansionStore.use((store) => store.setExpanded(bookmarkId, isExpanded)),

  // Only plain folders take an icon. Deleting a bookmark or split pin doesn't drop an icon, so an
  // icon set on one would stay in storage forever
  SetFolderIcon: Effect.fnUntraced(function* ({
    bookmarkId,
    icon,
  }: {
    bookmarkId: BookmarkId
    icon: FolderIcon | null
  }) {
    const { node } = yield* (yield* PinnedBookmarks).locate(bookmarkId)
    if (node._tag !== "PinnedFolder") return yield* reject("background.folder.notFound")
    const store = yield* FolderIconStore
    yield* icon === null ? store.forget([bookmarkId]) : store.setIcon(bookmarkId, icon)
  }),

  DeleteFolder: Effect.fnUntraced(function* ({ bookmarkId }: { bookmarkId: BookmarkId }) {
    const pinned = yield* PinnedBookmarks
    const { node } = yield* pinned.locate(bookmarkId)
    const liveFolderIds =
      node._tag === "PinnedFolder" ? liveFoldersIn(node.children).map((live) => live.id) : []
    yield* pinned.removeFolder(bookmarkId)
    yield* pruneStaleBindings
    yield* releaseLiveFolders(liveFolderIds)
  }),
}

const liveFolderOrReject = Effect.fnUntraced(function* (bookmarkId: BookmarkId) {
  const { node } = yield* (yield* PinnedBookmarks).locate(bookmarkId)
  if (node._tag !== "PinnedLiveFolder") return yield* reject("background.liveFolder.notFound")
  return node
})

const parseUrl = Option.liftThrowable((url: string) => new URL(url))

const isWebUrl = (url: string): boolean =>
  Option.exists(parseUrl(url), ({ protocol }) => protocol === "http:" || protocol === "https:")

/** Opens the URL as a temporary tab of the Space shown in the window. */
const openInActiveSpace = Effect.fnUntraced(function* (windowId: WindowId, url: string) {
  const state = yield* KatipState
  const tab = yield* (yield* Tabs).create({ windowId, url, active: true })
  const activeSpace = activeSpaceOf(yield* state.workspace.get, windowId)
  if (Option.isNone(activeSpace)) return
  const now = yield* Clock.currentTimeMillis
  yield* state.workspace.update((workspace) => assignTab(workspace, tab.id, activeSpace.value, now))
})

const liveFolderCommands = {
  CreateLiveFolder: Effect.fnUntraced(function* ({
    spaceId,
    parentId,
    source,
  }: {
    spaceId: SpaceId
    parentId: BookmarkId | null
    source: LiveSource
  }) {
    const position = yield* pinnedPosition({ spaceId, parentId, index: Number.MAX_SAFE_INTEGER })
    const folderId = yield* (yield* PinnedBookmarks).createLiveFolder(
      { parent: position.parent },
      { title: defaultLiveFolderTitle(source, yield* currentTranslator), source },
    )
    yield* (yield* LiveFolders).refresh(folderId, source)
    yield* scheduleLiveFolderRefresh
    return folderId
  }),

  RefreshLiveFolder: Effect.fnUntraced(function* ({ bookmarkId }: { bookmarkId: BookmarkId }) {
    const live = yield* liveFolderOrReject(bookmarkId)
    yield* (yield* LiveFolders).refresh(live.id, live.source)
  }),

  // Not in the live folder's own Space but in the one shown in the calling window: while another
  // Space is shown, the tab would open somewhere out of sight
  OpenLiveItem: Effect.fnUntraced(function* ({
    windowId,
    bookmarkId,
    itemId,
  }: {
    windowId: WindowId
    bookmarkId: BookmarkId
    itemId: string
  }) {
    const liveFolders = yield* LiveFolders
    yield* liveFolderOrReject(bookmarkId)
    const item = yield* Effect.flatMap(
      liveFolders.findItem(bookmarkId, itemId),
      Option.match({
        onNone: () => reject("background.liveFolder.itemNotFound"),
        onSome: Effect.succeed,
      }),
    )
    yield* openInActiveSpace(windowId, item.url)
    yield* liveFolders.markItemSeen(bookmarkId, itemId)
  }),

  MarkLiveFolderSeen: ({ bookmarkId }: { bookmarkId: BookmarkId }) =>
    LiveFolders.use((liveFolders) => liveFolders.markAllSeen(bookmarkId)),

  SetLiveFolderSort: Effect.fnUntraced(function* ({
    bookmarkId,
    sort,
  }: {
    bookmarkId: BookmarkId
    sort: LiveSort
  }) {
    yield* liveFolderOrReject(bookmarkId)
    yield* (yield* LiveFolders).setSort(bookmarkId, sort)
  }),

  // The side panel may send any string, so javascript: and the extension's or browser's internal
  // pages are never opened
  OpenUrl: Effect.fnUntraced(function* ({ windowId, url }: { windowId: WindowId; url: string }) {
    if (!isWebUrl(url)) return yield* reject("background.url.cannotOpen")
    yield* openInActiveSpace(windowId, url)
  }),

  SetGitHubToken: Effect.fnUntraced(function* ({ token }: { token: string }) {
    yield* (yield* GitHubTokenStore).save(token)
    yield* refreshLiveFoldersWhere((source) => source._tag === "GitHub")
  }),
}

const archiveCommands = {
  RestoreArchiveEntry: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "RestoreArchiveEntry" }>,
  ) {
    const state = yield* KatipState
    const entry = yield* (yield* ArchiveRepository).remove(command.entryId)
    if (Option.isNone(entry)) return yield* reject("background.archive.notFound")
    const tab = yield* (yield* Tabs).create({
      windowId: command.windowId,
      url: entry.value.url,
      active: true,
    })
    const spaceExists = (yield* state.spaces.get).some((space) => space.id === entry.value.spaceId)
    if (!spaceExists) return
    const now = yield* Clock.currentTimeMillis
    yield* state.workspace.update((workspace) =>
      switchSpace(
        assignTab(workspace, tab.id, entry.value.spaceId, now),
        command.windowId,
        entry.value.spaceId,
      ),
    )
  }),

  RemoveArchiveEntry: (command: Extract<SidebarCommand, { _tag: "RemoveArchiveEntry" }>) =>
    ArchiveRepository.use((archive) => archive.remove(command.entryId)),

  UpdateAutoArchive: (command: Extract<SidebarCommand, { _tag: "UpdateAutoArchive" }>) =>
    SettingsRepository.use((settings) =>
      settings.update({
        autoArchive: { enabled: command.enabled, idleMinutes: command.idleMinutes },
      }),
    ),

  OpenSettings: () => ExtensionInfo.use((info) => info.openOptionsPage),

  OpenSpotlight: ({ windowId }: { windowId: WindowId }) => openSpotlight(windowId),
}

const executeCommand = (command: SidebarCommand) =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      ...spaceCommands,
      ...tabCommands,
      ...splitCommands,
      ...pinnedCommands,
      ...liveFolderCommands,
      ...archiveCommands,
    }),
  )

const reasonFor = (error: {
  readonly _tag: string
}): Effect.Effect<string, never, SettingsRepository> =>
  error instanceof CommandRejected
    ? Effect.succeed(error.reason)
    : translate(
        Match.value(error._tag).pipe(
          Match.when("SpaceNotFound", (): PlainMessageKey => "background.space.notFound"),
          Match.when("LastSpaceRemoval", (): PlainMessageKey => "background.space.lastOne"),
          Match.when("PinnedNodeNotFound", (): PlainMessageKey => "background.pin.notFound"),
          Match.when(
            "FolderDepthExceeded",
            (): PlainMessageKey => "background.folder.tooDeepToCreate",
          ),
          Match.when("MoveIntoDescendant", (): PlainMessageKey => "background.folder.intoItself"),
          Match.orElse((): PlainMessageKey => "background.operation.failed"),
        ),
      )

/**
 * Runs a side panel command and returns its outcome. Failures are returned as `Failed` too; the
 * Effect itself never fails.
 */
export const runSidebarCommand = (command: SidebarCommand) =>
  executeCommand(command).pipe(
    Effect.map((result): CommandOutcome => ({
      _tag: "Succeeded",
      createdBookmarkId:
        command._tag === "CreateFolder" || command._tag === "CreateLiveFolder"
          ? (result as BookmarkId)
          : null,
    })),
    Effect.catch((error: { readonly _tag: string }) =>
      Effect.andThen(
        Effect.logWarning("A command failed", command._tag, error),
        Effect.map(reasonFor(error), (reason): CommandOutcome => ({ _tag: "Failed", reason })),
      ),
    ),
    // An outcome even for an unexpected exception: without one, the side panel waits forever
    Effect.catchDefect((defect) =>
      Effect.andThen(
        Effect.logError("A command stopped on an unexpected exception", command._tag, defect),
        Effect.map(translate("background.operation.failed"), (reason): CommandOutcome => ({
          _tag: "Failed",
          reason,
        })),
      ),
    ),
  )
