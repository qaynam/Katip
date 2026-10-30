<script lang="ts">
  import { Option } from "effect"
  import type { TabView } from "#protocol"
  import { temporaryPlacementAt, type DragSource } from "../logic/drag-drop"
  import { tabTitleChange } from "../logic/drafts"
  import { getSidebarContext } from "../state/sidebar-context"
  import { openTabMenu } from "./menus"
  import TabRow from "./TabRow.svelte"

  interface Props {
    tab: TabView
  }

  const { tab }: Props = $props()
  const ctx = getSidebarContext()
  const dragSource: DragSource = $derived({ _tag: "TemporaryTab", tabId: tab.tabId })

  const rename = (draft: string) => {
    const change = tabTitleChange(draft, tab.title)
    if (Option.isSome(change))
      void ctx.run({ _tag: "RenameTab", tabId: tab.tabId, title: change.value })
  }
</script>

<TabRow
  rowKey="temporary:{tab.tabId}"
  tabId={tab.tabId}
  title={tab.title || tab.url}
  pageUrl={tab.url}
  favIconUrl={tab.favIconUrl}
  isOpen
  isActive={tab.isActive}
  isLoading={tab.isLoading}
  isAudible={tab.isAudible}
  isMuted={tab.isMuted}
  isDiscarded={tab.isDiscarded}
  renameInitial={tab.title}
  onRename={rename}
  onActivate={() => void ctx.run({ _tag: "ActivateTab", tabId: tab.tabId })}
  onClose={() => void ctx.run({ _tag: "CloseTab", tabId: tab.tabId })}
  menuLabel="タブのメニュー"
  menuEntries={(startRename) => openTabMenu(ctx, tab.tabId, { isPinned: false, startRename })}
  {dragSource}
  dropTargetAt={(edge) => ({
    _tag: "Temporary",
    placement: temporaryPlacementAt(tab.tabId, edge),
  })}
  splitTarget={{ _tag: "SplitWith", tabId: tab.tabId }}
/>
