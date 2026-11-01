<script lang="ts">
  import { Option } from "effect"
  import type { PinnedItemView } from "#protocol"
  import type { DragSource, DropTarget, Edge, PinnedPosition } from "../logic/drag-drop"
  import { bookmarkTitleChange } from "../logic/drafts"
  import { pinnedItemDisplay } from "../logic/view-queries"
  import { action } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import { openTabMenu } from "./menus"
  import TabRow from "./TabRow.svelte"

  interface Props {
    item: PinnedItemView
    position: PinnedPosition | null
    dropTargetAt: (edge: Edge) => DropTarget | null
  }

  const { item, position, dropTargetAt }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const display = $derived(pinnedItemDisplay(item))
  const openTab = $derived(item.openTab?.tab ?? null)
  const dragSource: DragSource = $derived({
    _tag: "PinnedItem",
    bookmarkId: item.bookmarkId,
    openTabId: openTab?.tabId ?? null,
    position,
  })

  const rename = (draft: string) => {
    const change = bookmarkTitleChange(draft, item.title)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenamePinnedItem", bookmarkId: item.bookmarkId, title: change.value })
    }
  }

  const activate = () => {
    void ctx.run(
      openTab === null
        ? { _tag: "OpenPinnedItem", windowId: ctx.view.windowId, bookmarkId: item.bookmarkId }
        : { _tag: "ActivateTab", tabId: openTab.tabId },
    )
  }

  const confirmRemoval = async () => {
    const confirmed = await ctx.dialog.confirm({
      title: t("sidepanel.pin.deleteTitle"),
      message: t("sidepanel.pin.deleteMessage", { title: display.title }),
      confirmLabel: t("common.delete"),
    })
    if (confirmed) void ctx.run({ _tag: "RemovePinnedItem", bookmarkId: item.bookmarkId })
  }

  const menuEntries = (startRename: () => void) =>
    openTab === null
      ? [
          action(t("common.rename"), startRename),
          action(t("sidepanel.pin.delete"), () => void confirmRemoval(), { tone: "danger" }),
        ]
      : openTabMenu(ctx, openTab.tabId, { isPinned: true, startRename })
</script>

<TabRow
  rowKey="pinned:{item.bookmarkId}"
  tabId={openTab?.tabId ?? null}
  title={display.title}
  pageUrl={openTab?.url ?? item.url}
  favIconUrl={openTab?.favIconUrl ?? null}
  isOpen={openTab !== null}
  isActive={openTab?.isActive ?? false}
  isLoading={openTab?.isLoading ?? false}
  isAudible={openTab?.isAudible ?? false}
  isMuted={openTab?.isMuted ?? false}
  isDiscarded={openTab?.isDiscarded ?? false}
  onReturnToPinnedUrl={display._tag === "NavigatedAway" && openTab !== null
    ? () => void ctx.run({ _tag: "ResetPinnedTab", tabId: openTab.tabId })
    : undefined}
  renameInitial={item.title}
  onRename={rename}
  onActivate={activate}
  onClose={openTab === null
    ? undefined
    : () => void ctx.run({ _tag: "CloseTab", tabId: openTab.tabId })}
  menuLabel={t(openTab === null ? "sidepanel.pin.menu" : "sidepanel.tab.menu")}
  {menuEntries}
  {dragSource}
  {dropTargetAt}
/>
