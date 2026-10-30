<script lang="ts">
  import { Option } from "effect"
  import type { SplitViewId } from "#platform/browser"
  import type { TabView } from "#protocol"
  import { temporaryPlacementAt, type DragSource } from "../logic/drag-drop"
  import { tabTitleChange } from "../logic/drafts"
  import { getSidebarContext } from "../state/sidebar-context"
  import { temporarySplitMenu } from "./menus"
  import SplitRow, { type SplitHalf } from "./SplitRow.svelte"

  interface Props {
    splitViewId: SplitViewId
    tabs: readonly [TabView, TabView]
  }

  const { splitViewId, tabs }: Props = $props()
  const ctx = getSidebarContext()

  const halfOf = (tab: TabView): SplitHalf => ({
    tabId: tab.tabId,
    title: tab.title || tab.url,
    pageUrl: tab.url,
    favIconUrl: tab.favIconUrl,
    isActive: tab.isActive,
    isLoading: tab.isLoading,
    isAudible: tab.isAudible,
    isMuted: tab.isMuted,
    isDiscarded: tab.isDiscarded,
    renameInitial: tab.title,
    onRename: (draft) => {
      const change = tabTitleChange(draft, tab.title)
      if (Option.isSome(change)) {
        void ctx.run({ _tag: "RenameTab", tabId: tab.tabId, title: change.value })
      }
    },
    onActivate: () => void ctx.run({ _tag: "ActivateTab", tabId: tab.tabId }),
    onClose: () => void ctx.run({ _tag: "CloseTab", tabId: tab.tabId }),
  })

  const halves = $derived([halfOf(tabs[0]), halfOf(tabs[1])] as const)
  const dragSource: DragSource = $derived({
    _tag: "TemporarySplit",
    splitViewId,
    tabIds: [tabs[0].tabId, tabs[1].tabId],
  })
</script>

<SplitRow
  rowKey="temporary-split:{splitViewId}"
  {halves}
  menuLabel="分割ビューのメニュー"
  menuEntries={() => temporarySplitMenu(ctx, splitViewId)}
  {dragSource}
  dropTargetAt={(edge) => ({
    _tag: "Temporary",
    placement: temporaryPlacementAt(tabs[0].tabId, edge),
  })}
/>
