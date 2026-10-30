import { Option } from "effect"
import type { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { PinnedLiveFolderView, PinnedSplitView, SidebarCommand, SpaceView } from "#protocol"
import { sourceOrigins, unseenCount, type LiveSourceKind } from "../logic/live-folders"
import { themeSwatch } from "../logic/space-themes"
import { openSplitViewOf, otherSpaces } from "../logic/view-queries"
import { messages } from "../messages"
import { action, separator, submenu, type MenuEntry } from "../state/menu-controller.svelte"
import type { SidebarContext } from "../state/sidebar-context"
import type { SpaceSetupSteps } from "../state/space-setup.svelte"

export const openTabMenu = (
  ctx: SidebarContext,
  tabId: TabId,
  options: { readonly isPinned: boolean; readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const run = (command: SidebarCommand) => () => void ctx.run(command)
  const destinations = otherSpaces(ctx.view).map((space) =>
    action(space.name, run({ _tag: "MoveTabToSpace", tabId, spaceId: space.id }), {
      swatch: Option.getOrElse(themeSwatch(space.theme.colors), () => "currentColor"),
    }),
  )
  return [
    action("Favorites に追加", run({ _tag: "AddToFavorites", tabId })),
    options.isPinned
      ? action("ピン留めを外す", run({ _tag: "UnpinTab", tabId }))
      : action("ピン留め", run({ _tag: "PinTab", tabId })),
    ...(options.isPinned
      ? [
          action(
            "ブックマークの URL を現在の URL に置き換え",
            run({ _tag: "ReplacePinnedUrl", tabId }),
          ),
        ]
      : []),
    action("名前を変更", options.startRename),
    separator,
    ...(destinations.length > 0 ? [submenu("Space へ移動", destinations)] : []),
    action("アーカイブ", run({ _tag: "ArchiveTab", tabId })),
    action("閉じる", run({ _tag: "CloseTab", tabId })),
  ]
}

export const temporarySplitMenu = (
  ctx: SidebarContext,
  splitViewId: SplitViewId,
): ReadonlyArray<MenuEntry> => {
  const { pinned, id: spaceId } = ctx.activeSpace
  const pinAtEnd: SidebarCommand = {
    _tag: "PlaceSplitInPinned",
    splitViewId,
    placement: {
      spaceId,
      parentId: null,
      index: pinned._tag === "Available" ? pinned.nodes.length : 0,
    },
  }
  return [
    ...(ctx.view.canSplit
      ? [action("分割を解除", () => void ctx.run({ _tag: "Unsplit", splitViewId }))]
      : []),
    action("ピン留め", () => void ctx.run(pinAtEnd), { disabled: pinned._tag !== "Available" }),
  ]
}

const confirmSplitPinRemoval = async (
  ctx: SidebarContext,
  split: PinnedSplitView,
  titles: readonly [string, string],
) => {
  const confirmed = await ctx.dialog.confirm({
    title: "ピンを削除しますか？",
    message: `「${titles[0]}」と「${titles[1]}」を並べたピンのブックマークを削除します。開いているタブは閉じません。`,
    confirmLabel: "削除",
  })
  if (confirmed) void ctx.run({ _tag: "RemovePinnedItem", bookmarkId: split.bookmarkId })
}

export const pinnedSplitMenu = (
  ctx: SidebarContext,
  split: PinnedSplitView,
  options: { readonly titles: readonly [string, string]; readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const splitViewId = openSplitViewOf(split)
  return [
    action("名前を変更", options.startRename),
    ...(splitViewId === null
      ? []
      : [
          action(
            "ピン留めを外す",
            () =>
              void ctx.run({
                _tag: "PlaceSplitInTemporary",
                splitViewId,
                spaceId: ctx.activeSpace.id,
                placement: { _tag: "Top" },
              }),
          ),
        ]),
    separator,
    action("ピンを削除", () => void confirmSplitPinRemoval(ctx, split, options.titles), {
      tone: "danger",
    }),
  ]
}

/** 作成できたら、そのフォルダの名前をすぐ編集できるようにする */
export const createFolder = async (ctx: SidebarContext, parentId: BookmarkId | null) => {
  const outcome = await ctx.run({ _tag: "CreateFolder", spaceId: ctx.activeSpace.id, parentId })
  if (outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null) {
    ctx.pendingRename.request(outcome.createdBookmarkId)
  }
}

const liveSourceKinds: ReadonlyArray<LiveSourceKind> = ["Gmail", "GitHub"]

export const addLiveFolderMenu = (ctx: SidebarContext, parentId: BookmarkId | null): MenuEntry =>
  submenu(
    messages.liveFolder.addMenu,
    liveSourceKinds.map((kind) =>
      action(messages.liveFolder.sourceNames[kind], () =>
        ctx.liveFolderDialog.open({ _tag: "Create", kind, spaceId: ctx.activeSpace.id, parentId }),
      ),
    ),
  )

/**
 * 取得元へのアクセスを求め、許可されたら取得し直す。Chrome はユーザー操作の処理中にしか
 * 尋ねないので、クリックなどのハンドラから同期的に呼ぶ。
 */
export const grantAccessAndRefresh = async (ctx: SidebarContext, folder: PinnedLiveFolderView) => {
  const isGranted = await ctx.originAccess.request(sourceOrigins(folder.source._tag))
  if (!isGranted) {
    ctx.toasts.show(messages.liveFolder.accessDenied(folder.source._tag), "error")
    return
  }
  await ctx.run({ _tag: "RefreshLiveFolder", bookmarkId: folder.bookmarkId })
}

const confirmLiveFolderRemoval = async (ctx: SidebarContext, folder: PinnedLiveFolderView) => {
  const title = folder.title || messages.liveFolder.untitled
  const confirmed = await ctx.dialog.confirm({
    title: messages.liveFolder.removeTitle,
    message: messages.liveFolder.removeMessage(title),
    confirmLabel: messages.common.delete,
  })
  if (confirmed) void ctx.run({ _tag: "DeleteFolder", bookmarkId: folder.bookmarkId })
}

export const liveFolderMenu = (
  ctx: SidebarContext,
  folder: PinnedLiveFolderView,
  options: { readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const { bookmarkId, status } = folder
  const failure = status._tag === "Failed" ? status : null
  return [
    action(
      messages.liveFolder.refreshNow,
      () => void ctx.run({ _tag: "RefreshLiveFolder", bookmarkId }),
      { disabled: status._tag === "Refreshing" },
    ),
    action(
      messages.liveFolder.markAllSeen,
      () => void ctx.run({ _tag: "MarkLiveFolderSeen", bookmarkId }),
      { disabled: unseenCount(folder) === 0 },
    ),
    ...(failure?.needsPermission === true
      ? [action(messages.liveFolder.grantAccess, () => void grantAccessAndRefresh(ctx, folder))]
      : []),
    ...(failure?.needsToken === true
      ? [
          action(messages.liveFolder.setToken, () =>
            ctx.liveFolderDialog.open({ _tag: "SetGitHubToken", bookmarkId }),
          ),
        ]
      : []),
    action(messages.common.rename, options.startRename),
    separator,
    action(messages.liveFolder.remove, () => void confirmLiveFolderRemoval(ctx, folder), {
      tone: "danger",
    }),
  ]
}

const confirmSpaceDeletion = async (ctx: SidebarContext, space: SpaceView) => {
  const confirmed = await ctx.dialog.confirm({
    title: `「${space.name}」を削除しますか？`,
    message:
      "この Space のピン留めとフォルダも削除されます。開いている一時タブは閉じずに、別の Space に移動します。",
    confirmLabel: "Space を削除",
  })
  if (confirmed) void ctx.run({ _tag: "DeleteSpace", spaceId: space.id })
}

/** 名前やテーマの編集は、表示されていない Space ならまずその Space へ切り替えてから始める */
const setUpSpace = (ctx: SidebarContext, space: SpaceView, steps: SpaceSetupSteps) => () => {
  ctx.spaceSetup.requestFor(space.id, steps)
  if (space.id !== ctx.activeSpace.id) {
    void ctx.run({ _tag: "SwitchSpace", windowId: ctx.view.windowId, spaceId: space.id })
  }
}

export const spaceMenuEntries = (
  ctx: SidebarContext,
  space: SpaceView,
): ReadonlyArray<MenuEntry> => {
  const canCreateFolder =
    space.id === ctx.activeSpace.id &&
    space.pinned._tag === "Available" &&
    space.pinned.canCreateFolder
  return [
    action("テーマを編集", setUpSpace(ctx, space, { rename: false, editTheme: true })),
    action("名前を変更", setUpSpace(ctx, space, { rename: true, editTheme: false })),
    ...(canCreateFolder
      ? [action("新しいフォルダ", () => void createFolder(ctx, null)), addLiveFolderMenu(ctx, null)]
      : []),
    separator,
    action("Space を削除", () => void confirmSpaceDeletion(ctx, space), {
      tone: "danger",
      disabled: ctx.view.spaces.length <= 1,
    }),
    separator,
    action("設定を開く", () => void ctx.run({ _tag: "OpenSettings" })),
  ]
}
