<script lang="ts">
  import { Option } from "effect"
  import type { Translator } from "#modules/i18n"
  import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
  import type { OriginAccess } from "../connection/origin-access"
  import type { FaviconResolver } from "../logic/favicon"
  import { detectSwipe, neighborSpaceId } from "../logic/swipe"
  import { DialogController } from "../state/dialog-controller.svelte"
  import { DragSession } from "../state/drag-session.svelte"
  import { FolderIconPickerController } from "../state/folder-icon-picker.svelte"
  import { FolderSearchController } from "../state/folder-search.svelte"
  import { LiveFolderDialogController } from "../state/live-folder-dialog.svelte"
  import { MenuController } from "../state/menu-controller.svelte"
  import { PendingRename } from "../state/pending-rename.svelte"
  import { setSidebarContext } from "../state/sidebar-context"
  import { PendingSpaceSetup } from "../state/space-setup.svelte"
  import { ThemeDraft } from "../state/theme-draft.svelte"
  import { ThemePickerController } from "../state/theme-picker.svelte"
  import type { ToastQueue } from "../state/toast-queue.svelte"
  import { TooltipController } from "../state/tooltip.svelte"
  import ArchivePanel from "./ArchivePanel.svelte"
  import BottomBar from "./BottomBar.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"
  import ContextMenu from "./ContextMenu.svelte"
  import FavoritesGrid from "./FavoritesGrid.svelte"
  import FolderIconPicker from "./FolderIconPicker.svelte"
  import FolderSearch from "./FolderSearch.svelte"
  import LiveFolderDialog from "./LiveFolderDialog.svelte"
  import PinnedSection from "./PinnedSection.svelte"
  import SpaceTitle from "./SpaceTitle.svelte"
  import SpotlightButton from "./SpotlightButton.svelte"
  import TemporarySection from "./TemporarySection.svelte"
  import ThemedSurface from "./ThemedSurface.svelte"
  import ThemePicker from "./ThemePicker.svelte"
  import Toasts from "./Toasts.svelte"
  import Tooltip from "./Tooltip.svelte"

  interface Props {
    view: SidebarView
    activeSpace: SpaceView
    run: (command: SidebarCommand) => Promise<CommandOutcome>
    toasts: ToastQueue
    translator: Translator
    originAccess: OriginAccess
    faviconUrl: FaviconResolver
    onReload: () => void
  }

  const { view, activeSpace, run, toasts, translator, originAccess, faviconUrl, onReload }: Props =
    $props()

  const menu = new MenuController()
  const dialog = new DialogController()
  const drag = new DragSession(() => ({ spaceId: activeSpace.id, canSplit: view.canSplit }))
  const themePicker = new ThemePickerController()
  const themeDraft = new ThemeDraft((draft) =>
    run({ _tag: "SetSpaceTheme", spaceId: draft.spaceId, theme: draft.theme }),
  )
  const tooltip = new TooltipController()
  const liveFolderDialog = new LiveFolderDialogController()
  const folderSearch = new FolderSearchController()
  const folderIconPicker = new FolderIconPickerController()
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
    spaceSetup: new PendingSpaceSetup(),
    themePicker,
    themeDraft,
    tooltip,
    get faviconUrl() {
      return faviconUrl
    },
    get toasts() {
      return toasts
    },
    get translator() {
      return translator
    },
    get originAccess() {
      return originAccess
    },
    liveFolderDialog,
    folderSearch,
    folderIconPicker,
  })

  let isArchiveOpen = $state(false)
  let lastSwipeAt = Number.NEGATIVE_INFINITY

  const displayedTheme = $derived(themeDraft.themeFor(activeSpace.id) ?? activeSpace.theme)

  $effect(() => {
    const draft = themeDraft.current
    if (draft === null) return
    themeDraft.settleWith(view.spaces.find((space) => space.id === draft.spaceId)?.theme ?? null)
  })

  $effect(() => {
    const picker = themePicker.current
    if (picker !== null && picker.spaceId !== activeSpace.id) {
      themeDraft.release()
      themePicker.close()
    }
  })

  const switchByWheel = (event: WheelEvent) => {
    if (drag.source !== null || themePicker.current !== null) return
    const direction = detectSwipe(event, event.timeStamp - lastSwipeAt)
    if (Option.isNone(direction)) return
    const destination = neighborSpaceId(view.spaces, activeSpace.id, direction.value)
    if (Option.isNone(destination)) return
    lastSwipeAt = event.timeStamp
    void run({ _tag: "SwitchSpace", windowId: view.windowId, spaceId: destination.value })
  }

  const dropAccepted = (event: DragEvent) => {
    event.preventDefault()
    const outcome = drag.takeOutcome()
    if (outcome?._tag === "Run") void run(outcome.command)
    else if (outcome?._tag === "SplitUnsupported")
      toasts.show(translator.t("sidepanel.split.unsupported"))
  }

  const forgetDropTargetWhenLeaving = (event: DragEvent) => {
    if (event.relatedTarget === null) drag.reject()
  }
</script>

<ThemedSurface theme={displayedTheme} transitionKey={activeSpace.id}>
  <main
    class="sidebar"
    inert={dialog.current !== null || liveFolderDialog.current !== null}
    onwheel={switchByWheel}
    ondragover={() => drag.reject()}
    ondrop={dropAccepted}
    ondragleave={forgetDropTargetWhenLeaving}
    ondragstart={() => tooltip.hide()}
  >
    <SpotlightButton />
    <FavoritesGrid favorites={view.favorites} />

    {#key activeSpace.id}
      <div class="space">
        <SpaceTitle space={activeSpace} />
        <div class="space-body">
          {#if isArchiveOpen}
            <ArchivePanel spaceId={activeSpace.id} />
          {:else}
            <PinnedSection pinned={activeSpace.pinned} {onReload} />
            <TemporarySection space={activeSpace} />
          {/if}
        </div>
      </div>
    {/key}

    <div class="bottom">
      <Toasts {toasts} {translator} />
      <BottomBar
        spaces={view.spaces}
        activeSpaceId={activeSpace.id}
        {isArchiveOpen}
        onToggleArchive={() => (isArchiveOpen = !isArchiveOpen)}
      />
    </div>
  </main>

  <ThemePicker />
  <ContextMenu />
  <FolderSearch />
  <FolderIconPicker />
  <LiveFolderDialog />
  <ConfirmDialog />
  <Tooltip />
</ThemedSurface>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .space {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    animation: space-in 200ms ease-out;
  }

  .space-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 0 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--divider) transparent;
  }

  .bottom {
    position: relative;
    flex: none;
  }

  @keyframes space-in {
    from {
      opacity: 0.3;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .space {
      animation: none;
    }
  }
</style>
