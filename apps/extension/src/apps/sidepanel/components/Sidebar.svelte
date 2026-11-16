<script lang="ts">
  import { Option } from "effect"
  import { untrack } from "svelte"
  import type { Translator } from "#modules/i18n"
  import type { Release } from "#modules/updates"
  import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
  import type { Downloads } from "../connection/downloads"
  import type { OriginAccess } from "../connection/origin-access"
  import type { ScrollPositions } from "../connection/scroll-positions"
  import type { SidePanel } from "../connection/side-panel"
  import type { FaviconResolver } from "../logic/favicon"
  import { openTabOf } from "../logic/drag-drop"
  import { detectSwipe, neighborSpaceId } from "../logic/swipe"
  import type { BodyPanelController } from "../state/body-panel.svelte"
  import { DialogController } from "../state/dialog-controller.svelte"
  import { DragSession } from "../state/drag-session.svelte"
  import { FolderIconPickerController } from "../state/folder-icon-picker.svelte"
  import { FolderSearchController } from "../state/folder-search.svelte"
  import { LiveFolderDialogController } from "../state/live-folder-dialog.svelte"
  import { MenuController } from "../state/menu-controller.svelte"
  import { PendingRename } from "../state/pending-rename.svelte"
  import { setSidebarContext } from "../state/sidebar-context"
  import { PendingSpaceSetup } from "../state/space-setup.svelte"
  import { SpaceSlide } from "../state/space-slide"
  import { ThemeDraft } from "../state/theme-draft.svelte"
  import { ThemePickerController } from "../state/theme-picker.svelte"
  import type { ToastQueue } from "../state/toast-queue.svelte"
  import { TooltipController } from "../state/tooltip.svelte"
  import ArchivePanel from "./ArchivePanel.svelte"
  import BottomBar from "./BottomBar.svelte"
  import ClosePanelButton from "./ClosePanelButton.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"
  import ContextMenu from "./ContextMenu.svelte"
  import DownloadsPanel from "./DownloadsPanel.svelte"
  import FavoritesGrid from "./FavoritesGrid.svelte"
  import FolderIconPicker from "./FolderIconPicker.svelte"
  import FolderSearch from "./FolderSearch.svelte"
  import LiveFolderDialog from "./LiveFolderDialog.svelte"
  import PinnedSection from "./PinnedSection.svelte"
  import { slideAcross } from "./slide-across"
  import SpaceTitle from "./SpaceTitle.svelte"
  import SpotlightButton from "./SpotlightButton.svelte"
  import TemporarySection from "./TemporarySection.svelte"
  import ThemedSurface from "./ThemedSurface.svelte"
  import ThemePicker from "./ThemePicker.svelte"
  import Toasts from "./Toasts.svelte"
  import Tooltip from "./Tooltip.svelte"
  import UpdateCard from "./UpdateCard.svelte"

  interface Props {
    view: SidebarView
    activeSpace: SpaceView
    run: (command: SidebarCommand) => Promise<CommandOutcome>
    toasts: ToastQueue
    bodyPanel: BodyPanelController
    translator: Translator
    originAccess: OriginAccess
    downloads: Downloads
    faviconUrl: FaviconResolver
    scrollPositions: ScrollPositions
    sidePanel: SidePanel
    /** A newer release to tell about, or null for none. */
    updateNotice: Release | null
    onDismissUpdate: () => void
    onReload: () => void
  }

  const {
    view,
    activeSpace,
    run,
    toasts,
    bodyPanel,
    translator,
    originAccess,
    downloads,
    faviconUrl,
    scrollPositions,
    sidePanel,
    updateNotice,
    onDismissUpdate,
    onReload,
  }: Props = $props()

  const menu = new MenuController()
  const dialog = new DialogController()
  const drag = new DragSession(() => ({ spaceId: activeSpace.id, canSplit: view.canSplit }), {
    windowId: () => view.windowId,
    run: (command) => void run(command),
  })
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
    get bodyPanel() {
      return bodyPanel
    },
    get translator() {
      return translator
    },
    get originAccess() {
      return originAccess
    },
    get downloads() {
      return downloads
    },
    get sidePanel() {
      return sidePanel
    },
    liveFolderDialog,
    folderSearch,
    folderIconPicker,
  })

  let lastSwipeAt = Number.NEGATIVE_INFINITY
  const spaceSlide = new SpaceSlide(
    untrack(() => view.spaces),
    untrack(() => activeSpace.id),
  )
  $effect.pre(() => spaceSlide.follow(view.spaces, activeSpace.id))

  // Downloads belong to no Space, so their view takes the place of everything that shows one
  const isSpaceCovered = $derived(bodyPanel.current === "Downloads")

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
    if (drag.source !== null || themePicker.current !== null || isSpaceCovered) return
    const direction = detectSwipe(event, event.timeStamp - lastSwipeAt)
    if (Option.isNone(direction)) return
    const destination = neighborSpaceId(view.spaces, activeSpace.id, direction.value)
    if (Option.isNone(destination)) return
    lastSwipeAt = event.timeStamp
    spaceSlide.expectSwipe(destination.value, direction.value)
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

  // Chrome discards this page whenever the panel closes, and with it where the list was scrolled
  const keepScrollPosition = (body: HTMLElement) => {
    // Read without tracking: each view update would otherwise redo this and scroll the list back
    const [windowId, spaceId] = untrack(() => [view.windowId, activeSpace.id] as const)
    let isRestored = false
    let isDetached = false
    void scrollPositions.read(windowId, spaceId).then((top) => {
      if (isDetached) return
      if (top !== null) body.scrollTop = top
      isRestored = true
    })
    // Not saved before the position is restored: the active tab scrolling itself into view as the
    // list first shows would overwrite it. Nor while a panel is shown in the list's place
    const save = () => {
      if (isRestored && bodyPanel.current === null) {
        scrollPositions.save(windowId, spaceId, body.scrollTop)
      }
    }
    body.addEventListener("scrollend", save)
    return () => {
      isDetached = true
      body.removeEventListener("scrollend", save)
    }
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
    {#if !isSpaceCovered}
      <div class="top-bar">
        <SpotlightButton />
        <ClosePanelButton />
      </div>
      <FavoritesGrid favorites={view.favorites} />
    {/if}

    <div class="spaces">
      {#key activeSpace.id}
        <div
          class="space"
          in:slideAcross={{ side: spaceSlide.entersFrom }}
          out:slideAcross={{ side: spaceSlide.leavesTo }}
        >
          {#if !isSpaceCovered}
            <SpaceTitle space={activeSpace} />
          {/if}
          <div class="space-body" data-space-body {@attach keepScrollPosition}>
            {#if bodyPanel.current === "Archive"}
              <ArchivePanel spaceId={activeSpace.id} />
            {:else if bodyPanel.current === "Downloads"}
              <DownloadsPanel />
            {:else}
              <PinnedSection pinned={activeSpace.pinned} {onReload} />
              <TemporarySection space={activeSpace} />
            {/if}
          </div>
        </div>
      {/key}
    </div>

    <div class="bottom">
      <Toasts {toasts} {translator} />
      {#if view.canSplit && drag.source !== null && openTabOf(drag.source) !== null}
        <p class="page-drop-hint">{translator.t("sidepanel.split.pageDropHint")}</p>
      {/if}
      {#if updateNotice !== null}
        {@const release = updateNotice}
        <UpdateCard
          {release}
          onOpen={() => {
            void run({ _tag: "OpenUrl", windowId: view.windowId, url: release.pageUrl })
            onDismissUpdate()
          }}
          onDismiss={onDismissUpdate}
        />
      {/if}
      {#if !isSpaceCovered}
        <BottomBar spaces={view.spaces} activeSpaceId={activeSpace.id} />
      {/if}
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

  .top-bar {
    display: flex;
    flex: none;
    gap: 4px;
    align-items: center;
    padding: 8px 8px 0;
  }

  /* The Space left behind keeps the same cell as the one coming in until it has slid out. Clipped,
     not hidden: focus or scrollIntoView can scroll a hidden overflow and leave the Spaces shifted */
  .spaces {
    display: grid;
    flex: 1;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-height: 0;
    overflow-x: clip;
  }

  .space {
    display: flex;
    grid-area: 1 / 1;
    flex-direction: column;
    min-height: 0;
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

  .page-drop-hint {
    margin: 0 8px 6px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
    text-align: center;
  }
</style>
