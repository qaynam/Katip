<script lang="ts">
  import { Option } from "effect"
  import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
  import type { FaviconResolver } from "../logic/favicon"
  import { detectSwipe, neighborSpaceId } from "../logic/swipe"
  import { DialogController } from "../state/dialog-controller.svelte"
  import { DragSession } from "../state/drag-session.svelte"
  import { MenuController } from "../state/menu-controller.svelte"
  import { PendingRename } from "../state/pending-rename.svelte"
  import { setSidebarContext } from "../state/sidebar-context"
  import type { ToastQueue } from "../state/toast-queue.svelte"
  import ArchivePanel from "./ArchivePanel.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"
  import ContextMenu from "./ContextMenu.svelte"
  import FavoritesGrid from "./FavoritesGrid.svelte"
  import Icon from "./Icon.svelte"
  import PinnedSection from "./PinnedSection.svelte"
  import SpaceHeader from "./SpaceHeader.svelte"
  import SpaceSwitcher from "./SpaceSwitcher.svelte"
  import TemporarySection from "./TemporarySection.svelte"
  import Toasts from "./Toasts.svelte"

  interface Props {
    view: SidebarView
    activeSpace: SpaceView
    run: (command: SidebarCommand) => Promise<CommandOutcome>
    toasts: ToastQueue
    faviconUrl: FaviconResolver
    onReload: () => void
  }

  const { view, activeSpace, run, toasts, faviconUrl, onReload }: Props = $props()

  const menu = new MenuController()
  const dialog = new DialogController()
  const drag = new DragSession(() => activeSpace.id)
  setSidebarContext({
    run: (command) => run(command),
    get view() {
      return view
    },
    get activeSpace() {
      return activeSpace
    },
    menu,
    dialog,
    drag,
    pendingRename: new PendingRename(),
    get faviconUrl() {
      return faviconUrl
    },
  })

  let isArchiveOpen = $state(false)
  let lastSwipeAt = Number.NEGATIVE_INFINITY

  const switchByWheel = (event: WheelEvent) => {
    if (drag.source !== null) return
    const direction = detectSwipe(event, event.timeStamp - lastSwipeAt)
    if (Option.isNone(direction)) return
    const destination = neighborSpaceId(view.spaces, activeSpace.id, direction.value)
    if (Option.isNone(destination)) return
    lastSwipeAt = event.timeStamp
    void run({ _tag: "SwitchSpace", windowId: view.windowId, spaceId: destination.value })
  }

  const dropAcceptedCommand = (event: DragEvent) => {
    event.preventDefault()
    const command = drag.takeCommand()
    if (command !== null) void run(command)
  }

  const forgetDropTargetWhenLeaving = (event: DragEvent) => {
    if (event.relatedTarget === null) drag.reject()
  }
</script>

<div class="katip-root" data-space-color={activeSpace.color}>
  <main
    class="sidebar"
    inert={dialog.current !== null}
    onwheel={switchByWheel}
    ondragover={() => drag.reject()}
    ondrop={dropAcceptedCommand}
    ondragleave={forgetDropTargetWhenLeaving}
  >
    <FavoritesGrid favorites={view.favorites} />

    <SpaceHeader
      space={activeSpace}
      canDelete={view.spaces.length > 1}
      {isArchiveOpen}
      onToggleArchive={() => (isArchiveOpen = !isArchiveOpen)}
    />

    <div class="space-body">
      {#key activeSpace.id}
        <div class="space-content">
          {#if isArchiveOpen}
            <ArchivePanel spaceId={activeSpace.id} />
          {:else}
            <PinnedSection pinned={activeSpace.pinned} {onReload} />
            <TemporarySection space={activeSpace} />
          {/if}
        </div>
      {/key}
    </div>

    <div class="bottom">
      <Toasts {toasts} />
      <button
        class="new-tab"
        type="button"
        onclick={() => void run({ _tag: "OpenNewTab", windowId: view.windowId })}
      >
        <Icon name="plus" />
        <span>新しいタブ</span>
      </button>
      <SpaceSwitcher spaces={view.spaces} activeSpaceId={activeSpace.id} />
    </div>
  </main>

  <ContextMenu />
  <ConfirmDialog />
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .space-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--rule) transparent;
  }

  .space-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 0 6px;
    box-sizing: border-box;
    animation: space-in 180ms ease-out;
  }

  .bottom {
    position: relative;
    flex: none;
    padding-top: 4px;
  }

  .new-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 20px);
    height: 34px;
    margin: 0 10px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
    color: inherit;
    font: inherit;
    text-align: start;
    transition: background-color 120ms ease;
  }

  .new-tab:hover {
    background: var(--surface-raised-hover);
  }

  @keyframes space-in {
    from {
      opacity: 0.35;
      transform: translateY(3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .space-content {
      animation: none;
    }
  }
</style>
