import type { BookmarkId, TabId } from "#platform/browser"
import type { SidebarCommand } from "#protocol"
import { otherSpaces } from "../logic/view-queries"
import { action, separator, submenu, type MenuEntry } from "../state/menu-controller.svelte"
import type { SidebarContext } from "../state/sidebar-context"

export const openTabMenu = (
  ctx: SidebarContext,
  tabId: TabId,
  options: { readonly isPinned: boolean; readonly startRename: () => void },
): ReadonlyArray<MenuEntry> => {
  const run = (command: SidebarCommand) => () => void ctx.run(command)
  const destinations = otherSpaces(ctx.view).map((space) =>
    action(space.name, run({ _tag: "MoveTabToSpace", tabId, spaceId: space.id }), {
      color: space.color,
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

/** 作成できたら、そのフォルダの名前をすぐ編集できるようにする */
export const createFolder = async (ctx: SidebarContext, parentId: BookmarkId | null) => {
  const outcome = await ctx.run({ _tag: "CreateFolder", spaceId: ctx.activeSpace.id, parentId })
  if (outcome._tag === "Succeeded" && outcome.createdBookmarkId !== null) {
    ctx.pendingRename.request(outcome.createdBookmarkId)
  }
}
