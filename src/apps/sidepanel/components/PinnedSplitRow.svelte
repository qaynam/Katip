<script lang="ts">
  import { Option } from "effect"
  import type { PinnedItemView, PinnedSplitView } from "#protocol"
  import type { DragSource, DropTarget, Edge, PinnedPosition } from "../logic/drag-drop"
  import { bookmarkTitleChange } from "../logic/drafts"
  import { openSplitViewOf, pinnedItemDisplay } from "../logic/view-queries"
  import { getSidebarContext } from "../state/sidebar-context"
  import { pinnedSplitMenu } from "./menus"
  import SplitRow, { type SplitHalf } from "./SplitRow.svelte"

  interface Props {
    split: PinnedSplitView
    /** 閉じたフォルダに覗かせているときは、入れ子の中にあって位置が分からないことがある */
    position: PinnedPosition | null
    dropTargetAt: (edge: Edge) => DropTarget | null
  }

  const { split, position, dropTargetAt }: Props = $props()
  const ctx = getSidebarContext()

  const halfOf = (item: PinnedItemView): SplitHalf => {
    const tab = item.openTab?.tab ?? null
    return {
      tabId: tab?.tabId ?? null,
      title: pinnedItemDisplay(item).title,
      pageUrl: tab?.url ?? item.url,
      favIconUrl: tab?.favIconUrl ?? null,
      isActive: tab?.isActive ?? false,
      isLoading: tab?.isLoading ?? false,
      isAudible: tab?.isAudible ?? false,
      isMuted: tab?.isMuted ?? false,
      isDiscarded: tab?.isDiscarded ?? false,
      renameInitial: item.title,
      onRename: (draft) => {
        const change = bookmarkTitleChange(draft, item.title)
        if (Option.isSome(change)) {
          void ctx.run({
            _tag: "RenamePinnedItem",
            bookmarkId: item.bookmarkId,
            title: change.value,
          })
        }
      },
      // 片側のピンだけを開くと分割ビューにならないので、閉じている側を押しても 2 つ揃えて開く
      onActivate: () =>
        void ctx.run(
          tab === null
            ? { _tag: "OpenPinnedItem", windowId: ctx.view.windowId, bookmarkId: split.bookmarkId }
            : { _tag: "ActivateTab", tabId: tab.tabId },
        ),
      onClose:
        tab === null ? undefined : () => void ctx.run({ _tag: "CloseTab", tabId: tab.tabId }),
    }
  }

  const halves = $derived([halfOf(split.items[0]), halfOf(split.items[1])] as const)
  const dragSource: DragSource = $derived({
    _tag: "PinnedSplit",
    bookmarkId: split.bookmarkId,
    openSplitViewId: openSplitViewOf(split),
    position,
  })
</script>

<SplitRow
  rowKey="pinned-split:{split.bookmarkId}"
  {halves}
  menuLabel="分割ビューのピンのメニュー"
  menuEntries={(_, startRename) =>
    pinnedSplitMenu(ctx, split, {
      titles: [halves[0].title, halves[1].title],
      startRename,
    })}
  {dragSource}
  {dropTargetAt}
/>
