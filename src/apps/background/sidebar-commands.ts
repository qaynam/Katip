import { Array, Clock, Effect, Match, Option, Order, Schema } from "effect"
import { ArchiveRepository } from "#modules/archive"
import {
  FolderExpansionStore,
  PinnedBookmarks,
  PinnedParent,
  SpaceFolders,
  type PinnedPosition,
} from "#modules/pinned"
import { SettingsRepository } from "#modules/settings"
import {
  addSpace,
  moveSpace,
  recolorSpace,
  removeSpace,
  renameSpace,
  type Space,
  type SpaceId,
} from "#modules/space"
import { moveIndexFor } from "#modules/tab-order"
import {
  assignTab,
  bindPinned,
  moveTabToSpace,
  releaseSpace,
  setTitleOverride,
  switchSpace,
  tabsBoundTo,
  tabToFocus,
  trackedTab,
  unbindBookmark,
  unbindPinned,
  type TrackedTab,
} from "#modules/workspace"
import {
  Tabs,
  type BookmarkId,
  type BrowserTab,
  type TabId,
  type WindowId,
} from "#platform/browser"
import type { CommandOutcome, PinnedPlacement, SidebarCommand, TemporaryPlacement } from "#protocol"
import { pruneStaleBindings } from "./bindings"
import { ExtensionInfo } from "./extension-info"
import { newSpaceId } from "./initialize"
import { KatipState } from "./katip-state"
import { urlOf } from "./tab-admission"

export class CommandRejected extends Schema.TaggedError<CommandRejected>()("CommandRejected", {
  reason: Schema.String,
}) {}

const reject = (reason: string) => Effect.fail(new CommandRejected({ reason }))

const findSpace = Effect.fnUntraced(function* (spaceId: SpaceId) {
  const spaces = yield* (yield* KatipState).spaces.get
  return yield* Effect.fromOption(
    Array.findFirst(spaces, (space) => space.id === spaceId),
    () => new CommandRejected({ reason: "Space が見つかりません" }),
  )
})

const trackedOrReject = Effect.fnUntraced(function* (tabId: TabId) {
  const workspace = yield* (yield* KatipState).workspace.get
  return yield* Effect.fromOption(
    trackedTab(workspace, tabId),
    () => new CommandRejected({ reason: "このタブはどの Space にも属していません" }),
  )
})

const byIndex = Order.mapInput(Order.Number, (tab: BrowserTab) => tab.index)

const titleOf = (tab: BrowserTab) => Option.getOrElse(tab.title, () => urlOf(tab))

// Space へ切り替えたらその Space のタブを前面に出す。1 つも無ければ新しいタブを開く。
// 何も出さないと、サイドパネルは新しい Space を見せているのに、ブラウザは前の Space の
// タブを表示し続け、どちらが正しいのか分からなくなる
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
    const spaces = yield* state.spaces.update((current) =>
      addSpace(current, {
        id,
        ...(command.name !== undefined && { name: command.name }),
        ...(command.color !== undefined && { color: command.color }),
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

  RecolorSpace: (command: Extract<SidebarCommand, { _tag: "RecolorSpace" }>) =>
    KatipState.use((state) =>
      state.spaces.updateEffect((spaces) =>
        Effect.fromResult(recolorSpace(spaces, command.spaceId, command.color)),
      ),
    ),

  // ピン留めは Space と一緒にブックマークごと消えるが、開いている一時タブは閉じずに
  // 残る Space へ移す。タブを閉じると、作業中のページを確認なしに失わせてしまう
  DeleteSpace: Effect.fnUntraced(function* ({ spaceId }: { spaceId: SpaceId }) {
    const state = yield* KatipState
    const successor = Array.findFirst(yield* state.spaces.get, (space) => space.id !== spaceId)
    if (Option.isNone(successor)) return yield* reject("最後の Space は削除できません")
    yield* state.spaces.updateEffect((spaces) => Effect.fromResult(removeSpace(spaces, spaceId)))
    yield* state.workspace.update((workspace) =>
      releaseSpace(workspace, spaceId, successor.value.id),
    )
    yield* (yield* SpaceFolders).removeSpaceFolder(spaceId)
  }),

  MoveSpace: ({ spaceId, toIndex }: { spaceId: SpaceId; toIndex: number }) =>
    KatipState.use((state) =>
      state.spaces.updateEffect((spaces) => Effect.fromResult(moveSpace(spaces, spaceId, toIndex))),
    ),
}

const unpinFromChrome = Effect.fnUntraced(function* (tab: BrowserTab) {
  if (tab.pinned) yield* (yield* Tabs).update(tab.id, { pinned: false })
})

const removePin = Effect.fnUntraced(function* (tracked: TrackedTab) {
  if (tracked.pinned === null) return
  const state = yield* KatipState
  yield* (yield* PinnedBookmarks)
    .removeBookmark(tracked.pinned.bookmarkId)
    .pipe(Effect.catchTag("PinnedNodeNotFound", () => Effect.void))
  yield* state.workspace.update((workspace) => unbindPinned(workspace, tracked.tabId))
})

const placeInTemporary = Effect.fnUntraced(function* (
  tabId: TabId,
  spaceId: SpaceId,
  placement: TemporaryPlacement,
) {
  const state = yield* KatipState
  const tabs = yield* Tabs
  const settings = yield* (yield* SettingsRepository).get
  const tab = yield* tabs.get(tabId)
  yield* unpinFromChrome(tab)
  yield* Option.match(trackedTab(yield* state.workspace.get, tabId), {
    onNone: () => Effect.void,
    onSome: removePin,
  })
  const now = yield* Clock.currentTimeMillis
  const workspace = yield* state.workspace.update((current) =>
    assignTab(current, tabId, spaceId, now),
  )
  const windowTabs = Array.sort(yield* tabs.query({ windowId: tab.windowId }), byIndex)
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
    moving: tabId,
    placement,
    newestOnTop: settings.newTabsOnTop,
  })
  if (Option.isSome(index)) yield* tabs.move([tabId], { index: index.value })
})

const pinnedPosition = Effect.fnUntraced(function* (
  placement: PinnedPlacement,
): Effect.fn.Return<PinnedPosition, CommandRejected, KatipState> {
  const space = yield* findSpace(placement.spaceId)
  return {
    parent:
      placement.parentId === null
        ? PinnedParent.SpaceRoot({ space })
        : PinnedParent.Folder({ folderId: placement.parentId }),
    index: placement.index,
  }
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
    yield* pinned.moveBookmark(binding.value.bookmarkId, position)
  } else {
    const url = urlOf(tab)
    const bookmarkId = yield* pinned.createBookmark(position, { title: titleOf(tab), url })
    yield* state.workspace.update((workspace) =>
      bindPinned(assignTab(workspace, tabId, spaceId, now), tabId, { bookmarkId, pinnedUrl: url }),
    )
  }
  yield* state.workspace.update((workspace) => assignTab(workspace, tabId, spaceId, now))
})

const tabCommands = {
  OpenNewTab: ({ windowId }: { windowId: WindowId }) =>
    Tabs.use((tabs) => tabs.create({ windowId, active: true })),

  ActivateTab: ({ tabId }: { tabId: TabId }) =>
    Tabs.use((tabs) => tabs.update(tabId, { active: true })),

  CloseTab: ({ tabId }: { tabId: TabId }) => Tabs.use((tabs) => tabs.remove([tabId])),

  // ピンの名前はブックマークのタイトルそのものなので、上書きではなくブックマークを改名する。
  // 空にしたときは、上書きを外したときと同じくページのタイトルに戻す
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
      yield* (yield* PinnedBookmarks).moveBookmark(tracked.pinned.bookmarkId, {
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
    placeInTemporary(command.tabId, command.spaceId, command.placement),

  PlaceTabInPinned: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "PlaceTabInPinned" }>,
  ) {
    const position = yield* pinnedPosition(command.placement)
    yield* placeInPinned(command.tabId, command.placement.spaceId, position)
  }),

  PinTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const tracked = yield* trackedOrReject(tabId)
    const space = yield* findSpace(tracked.spaceId)
    yield* placeInPinned(tabId, tracked.spaceId, { parent: PinnedParent.SpaceRoot({ space }) })
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
  Effect.fromOption(
    Option.fromNullishOr(tracked.pinned),
    () => new CommandRejected({ reason: "このタブはピン留めされていません" }),
  )

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
    if (location.node._tag !== "PinnedBookmark") return yield* reject("フォルダは開けません")
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
    yield* (yield* PinnedBookmarks).moveBookmark(bookmarkId, yield* pinnedPosition(placement))
    yield* state.workspace.update((workspace) =>
      tabsBoundTo(workspace, bookmarkId).reduce(
        (acc, tab) => moveTabToSpace(acc, tab.tabId, placement.spaceId),
        workspace,
      ),
    )
  }),

  RemovePinnedItem: Effect.fnUntraced(function* ({ bookmarkId }: { bookmarkId: BookmarkId }) {
    yield* (yield* PinnedBookmarks).removeBookmark(bookmarkId)
    yield* (yield* KatipState).workspace.update((workspace) =>
      unbindBookmark(workspace, bookmarkId),
    )
  }),

  RenamePinnedItem: Effect.fnUntraced(function* ({
    bookmarkId,
    title,
  }: {
    bookmarkId: BookmarkId
    title: string
  }) {
    const trimmed = title.trim()
    if (trimmed === "") return yield* reject("名前を入力してください")
    yield* (yield* PinnedBookmarks).rename(bookmarkId, trimmed)
  }),

  ResetPinnedTab: Effect.fnUntraced(function* ({ tabId }: { tabId: TabId }) {
    const binding = yield* bindingOf(yield* trackedOrReject(tabId))
    yield* (yield* Tabs).update(tabId, { url: binding.pinnedUrl })
  }),

  // ピンの名前はユーザーが付けたものなので、URL だけを今のページに置き換える
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
    const settings = yield* (yield* SettingsRepository).get
    const position = yield* pinnedPosition({ spaceId, parentId, index: Number.MAX_SAFE_INTEGER })
    return yield* (yield* PinnedBookmarks).createFolder(
      { parent: position.parent },
      { title: "新しいフォルダ" },
      { isTabGroupSyncEnabled: settings.syncTabGroups },
    )
  }),

  SetFolderExpanded: ({
    bookmarkId,
    isExpanded,
  }: {
    bookmarkId: BookmarkId
    isExpanded: boolean
  }) => FolderExpansionStore.use((store) => store.setExpanded(bookmarkId, isExpanded)),

  DeleteFolder: Effect.fnUntraced(function* ({ bookmarkId }: { bookmarkId: BookmarkId }) {
    yield* (yield* PinnedBookmarks).removeFolder(bookmarkId)
    yield* pruneStaleBindings
  }),
}

const archiveCommands = {
  RestoreArchiveEntry: Effect.fnUntraced(function* (
    command: Extract<SidebarCommand, { _tag: "RestoreArchiveEntry" }>,
  ) {
    const state = yield* KatipState
    const entry = yield* (yield* ArchiveRepository).remove(command.entryId)
    if (Option.isNone(entry)) return yield* reject("アーカイブが見つかりません")
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
}

const executeCommand = (command: SidebarCommand) =>
  Match.value(command).pipe(
    Match.tagsExhaustive({
      ...spaceCommands,
      ...tabCommands,
      ...pinnedCommands,
      ...archiveCommands,
    }),
  )

const reasonFor = (error: { readonly _tag: string }): string =>
  Match.value(error._tag).pipe(
    Match.when("CommandRejected", () => (error as CommandRejected).reason),
    Match.when("SpaceNotFound", () => "Space が見つかりません"),
    Match.when("LastSpaceRemoval", () => "最後の Space は削除できません"),
    Match.when("PinnedNodeNotFound", () => "ピン留めが見つかりません"),
    Match.when("FolderDepthExceeded", () => "これ以上深い階層にはフォルダを作れません"),
    Match.orElse(() => "操作を完了できませんでした"),
  )

/**
 * サイドパネルのコマンドを実行し、結果を返す。失敗も `Failed` として返し、Effect としては失敗しない。
 */
export const runSidebarCommand = (command: SidebarCommand) =>
  executeCommand(command).pipe(
    Effect.map((result): CommandOutcome => ({
      _tag: "Succeeded",
      createdBookmarkId: command._tag === "CreateFolder" ? (result as BookmarkId) : null,
    })),
    Effect.catch((error: { readonly _tag: string }) =>
      Effect.as(Effect.logWarning("コマンドが失敗した", command._tag, error), {
        _tag: "Failed",
        reason: reasonFor(error),
      } satisfies CommandOutcome),
    ),
  )
