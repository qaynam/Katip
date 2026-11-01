import { Option } from "effect"
import type { MessageKey } from "#modules/i18n"
import { LiveSort } from "#modules/live-folders"
import type { BookmarkId, SplitViewId, TabId } from "#platform/browser"
import type { PinnedLiveFolderView, PinnedSplitView, SidebarCommand, SpaceView } from "#protocol"
import {
  liveSourceNames,
  sourceOrigins,
  unseenCount,
  type LiveSourceKind,
} from "../logic/live-folders"
import { themeSwatch } from "../logic/space-themes"
import { openSplitViewOf, otherSpaces } from "../logic/view-queries"
import { action, separator, submenu, type MenuEntry } from "../state/menu-controller.svelte"
import type { SidebarContext } from "../state/sidebar-context"
import type { SpaceSetupSteps } from "../state/space-setup.svelte"

export const openTabMenu = (
  ctx: SidebarContext,
  tabId: TabId,
  options: { readonly isPinned: boolean; readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const { t } = ctx.translator
  const run = (command: SidebarCommand) => () => void ctx.run(command)
  const destinations = otherSpaces(ctx.view).map((space) =>
    action(space.name, run({ _tag: "MoveTabToSpace", tabId, spaceId: space.id }), {
      swatch: Option.getOrElse(themeSwatch(space.theme.colors), () => "currentColor"),
    }),
  )
  return [
    action(t("sidepanel.tab.addToFavorites"), run({ _tag: "AddToFavorites", tabId })),
    options.isPinned
      ? action(t("sidepanel.tab.unpin"), run({ _tag: "UnpinTab", tabId }))
      : action(t("sidepanel.tab.pin"), run({ _tag: "PinTab", tabId })),
    ...(options.isPinned
      ? [action(t("sidepanel.tab.replacePinnedUrl"), run({ _tag: "ReplacePinnedUrl", tabId }))]
      : []),
    action(t("common.rename"), options.startRename),
    separator,
    ...(destinations.length > 0 ? [submenu(t("sidepanel.tab.moveToSpace"), destinations)] : []),
    action(t("sidepanel.tab.archive"), run({ _tag: "ArchiveTab", tabId })),
    action(t("common.close"), run({ _tag: "CloseTab", tabId })),
  ]
}

export const temporarySplitMenu = (
  ctx: SidebarContext,
  splitViewId: SplitViewId,
): ReadonlyArray<MenuEntry> => {
  const { t } = ctx.translator
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
      ? [
          action(
            t("sidepanel.split.separate"),
            () => void ctx.run({ _tag: "Unsplit", splitViewId }),
          ),
        ]
      : []),
    action(t("sidepanel.tab.pin"), () => void ctx.run(pinAtEnd), {
      disabled: pinned._tag !== "Available",
    }),
  ]
}

const confirmSplitPinRemoval = async (
  ctx: SidebarContext,
  split: PinnedSplitView,
  titles: readonly [string, string],
) => {
  const { t } = ctx.translator
  const confirmed = await ctx.dialog.confirm({
    title: t("sidepanel.pin.deleteTitle"),
    message: t("sidepanel.split.deleteMessage", { left: titles[0], right: titles[1] }),
    confirmLabel: t("common.delete"),
  })
  if (confirmed) void ctx.run({ _tag: "RemovePinnedItem", bookmarkId: split.bookmarkId })
}

export const pinnedSplitMenu = (
  ctx: SidebarContext,
  split: PinnedSplitView,
  options: { readonly titles: readonly [string, string]; readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const { t } = ctx.translator
  const splitViewId = openSplitViewOf(split)
  return [
    action(t("common.rename"), options.startRename),
    ...(splitViewId === null
      ? []
      : [
          action(
            t("sidepanel.tab.unpin"),
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
    action(
      t("sidepanel.pin.delete"),
      () => void confirmSplitPinRemoval(ctx, split, options.titles),
      {
        tone: "danger",
      },
    ),
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
    ctx.translator.t("sidepanel.liveFolder.add"),
    liveSourceKinds.map((kind) =>
      action(liveSourceNames[kind], () =>
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
    ctx.toasts.show(
      ctx.translator.t("sidepanel.liveFolder.accessDenied", {
        source: liveSourceNames[folder.source._tag],
      }),
      "error",
    )
    return
  }
  await ctx.run({ _tag: "RefreshLiveFolder", bookmarkId: folder.bookmarkId })
}

const confirmLiveFolderRemoval = async (ctx: SidebarContext, folder: PinnedLiveFolderView) => {
  const { t } = ctx.translator
  const title = folder.title || t("sidepanel.liveFolder.untitled")
  const confirmed = await ctx.dialog.confirm({
    title: t("sidepanel.liveFolder.deleteTitle"),
    message: t("sidepanel.liveFolder.deleteMessage", { title }),
    confirmLabel: t("common.delete"),
  })
  if (confirmed) void ctx.run({ _tag: "DeleteFolder", bookmarkId: folder.bookmarkId })
}

/** 取得元のログインページを、このウィンドウの一時タブとして開く */
export const openSignInPage = (ctx: SidebarContext, url: string) =>
  void ctx.run({ _tag: "OpenUrl", windowId: ctx.view.windowId, url })

const sortMessages = {
  newest: "sidepanel.liveFolder.sort.newest",
  oldest: "sidepanel.liveFolder.sort.oldest",
  title: "sidepanel.liveFolder.sort.title",
} as const satisfies Record<Exclude<LiveSort, "source">, MessageKey>

// "source" はまとめる単位が取得元で違う（差出人・リポジトリ）ので、呼び名も取得元ごとに持つ
const sourceSortMessages = {
  Gmail: "sidepanel.liveFolder.sort.sender",
  GitHub: "sidepanel.liveFolder.sort.repository",
} as const satisfies Record<LiveSourceKind, MessageKey>

const sortMessageOf = (sort: LiveSort, kind: LiveSourceKind) =>
  sort === "source" ? sourceSortMessages[kind] : sortMessages[sort]

const liveFolderSortMenu = (ctx: SidebarContext, folder: PinnedLiveFolderView): MenuEntry =>
  submenu(
    ctx.translator.t("sidepanel.liveFolder.sortBy"),
    LiveSort.literals.map((sort) =>
      action(
        ctx.translator.t(sortMessageOf(sort, folder.source._tag)),
        () => void ctx.run({ _tag: "SetLiveFolderSort", bookmarkId: folder.bookmarkId, sort }),
        { checked: sort === folder.sort },
      ),
    ),
  )

export const liveFolderMenu = (
  ctx: SidebarContext,
  folder: PinnedLiveFolderView,
  options: { readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const { t } = ctx.translator
  const { bookmarkId, status } = folder
  const failure = status._tag === "Failed" ? status : null
  const signInUrl = failure?.signInUrl ?? null
  return [
    action(
      t("sidepanel.liveFolder.refreshNow"),
      () => void ctx.run({ _tag: "RefreshLiveFolder", bookmarkId }),
      { disabled: status._tag === "Refreshing" },
    ),
    action(
      t("sidepanel.liveFolder.markAllSeen"),
      () => void ctx.run({ _tag: "MarkLiveFolderSeen", bookmarkId }),
      { disabled: unseenCount(folder) === 0 },
    ),
    liveFolderSortMenu(ctx, folder),
    ...(failure?.needsPermission === true
      ? [
          action(
            t("sidepanel.liveFolder.grantAccess"),
            () => void grantAccessAndRefresh(ctx, folder),
          ),
        ]
      : []),
    ...(signInUrl !== null
      ? [action(t("sidepanel.liveFolder.signIn"), () => openSignInPage(ctx, signInUrl))]
      : []),
    ...(failure?.needsToken === true
      ? [
          action(t("sidepanel.liveFolder.setToken"), () =>
            ctx.liveFolderDialog.open({ _tag: "SetGitHubToken", bookmarkId }),
          ),
        ]
      : []),
    action(t("common.rename"), options.startRename),
    separator,
    action(t("sidepanel.liveFolder.delete"), () => void confirmLiveFolderRemoval(ctx, folder), {
      tone: "danger",
    }),
  ]
}

const confirmSpaceDeletion = async (ctx: SidebarContext, space: SpaceView) => {
  const { t } = ctx.translator
  const confirmed = await ctx.dialog.confirm({
    title: t("sidepanel.space.deleteTitle", { name: space.name }),
    message: t("sidepanel.space.deleteMessage"),
    confirmLabel: t("sidepanel.space.delete"),
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
  const { t } = ctx.translator
  const canCreateFolder =
    space.id === ctx.activeSpace.id &&
    space.pinned._tag === "Available" &&
    space.pinned.canCreateFolder
  return [
    action(
      t("sidepanel.space.editTheme"),
      setUpSpace(ctx, space, { rename: false, editTheme: true }),
    ),
    action(t("common.rename"), setUpSpace(ctx, space, { rename: true, editTheme: false })),
    ...(canCreateFolder
      ? [
          action(t("common.newFolder"), () => void createFolder(ctx, null)),
          addLiveFolderMenu(ctx, null),
        ]
      : []),
    separator,
    action(t("sidepanel.space.delete"), () => void confirmSpaceDeletion(ctx, space), {
      tone: "danger",
      disabled: ctx.view.spaces.length <= 1,
    }),
    separator,
    action(t("actions.openSettings"), () => void ctx.run({ _tag: "OpenSettings" })),
  ]
}
