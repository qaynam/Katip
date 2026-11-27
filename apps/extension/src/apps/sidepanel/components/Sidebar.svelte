<script module lang="ts">
  // Not imported with the rest: none of them shows as the panel opens, so their code loads beside
  // the first frame rather than holding it back
  const panels = {
    archive: import("./ArchivePanel.svelte"),
    downloads: import("./DownloadsPanel.svelte"),
  }
  const dialogs = {
    folderSearch: import("./FolderSearch.svelte"),
    liveFolder: import("./LiveFolderDialog.svelte"),
    sound: import("./SoundDialog.svelte"),
    themePicker: import("./ThemePicker.svelte"),
  }

  /** Settles once the parts of the side panel that load after the rest have loaded. */
  export const laterParts: Promise<unknown> = Promise.all([
    ...Object.values(panels),
    ...Object.values(dialogs),
  ])
</script>

<script lang="ts">
  import { Option } from "effect"
  import { untrack } from "svelte"
  import type { Translator } from "#modules/i18n"
  import type { SpaceId } from "#modules/space"
  import type { Release } from "#modules/updates"
  import type { CommandOutcome, SidebarCommand, SidebarView, SpaceView } from "#protocol"
  import type { Downloads } from "../connection/downloads"
  import type { OriginAccess } from "../connection/origin-access"
  import type { PageOutputAccess } from "../connection/page-outputs"
  import type { ScrollPositions } from "../connection/scroll-positions"
  import type { SidePanel } from "../connection/side-panel"
  import type { FaviconResolver } from "../logic/favicon"
  import { openTabOf } from "../logic/drag-drop"
  import { newSpaceDraft } from "../logic/space-draft"
  import { enteringSide, oppositeSide } from "../logic/space-slide"
  import {
    detectSwipe,
    downloadsPage,
    newSpacePage,
    spacePage,
    swipeDestination,
    type SidebarPage,
  } from "../logic/swipe"
  import type { BodyPanelController } from "../state/body-panel.svelte"
  import { DialogController } from "../state/dialog-controller.svelte"
  import { DragSession } from "../state/drag-session.svelte"
  import { FolderIconPickerController } from "../state/folder-icon-picker.svelte"
  import { FolderSearchController } from "../state/folder-search.svelte"
  import { LiveFolderDialogController } from "../state/live-folder-dialog.svelte"
  import { SoundDialogController } from "../state/sound-dialog.svelte"
  import { MenuController } from "../state/menu-controller.svelte"
  import { PendingRename } from "../state/pending-rename.svelte"
  import { setSidebarContext } from "../state/sidebar-context"
  import { SpaceDraftController } from "../state/space-draft.svelte"
  import { PendingSpaceSetup } from "../state/space-setup.svelte"
  import { SpaceSlide } from "../state/space-slide"
  import { ThemeDraft } from "../state/theme-draft.svelte"
  import { ThemePickerController } from "../state/theme-picker.svelte"
  import type { ToastQueue } from "../state/toast-queue.svelte"
  import { TooltipController } from "../state/tooltip.svelte"
  import BottomBar from "./BottomBar.svelte"
  import ClosePanelButton from "./ClosePanelButton.svelte"
  import ConfirmDialog from "./ConfirmDialog.svelte"
  import ContextMenu from "./ContextMenu.svelte"
  import FavoritesGrid from "./FavoritesGrid.svelte"
  import FolderIconPicker from "./FolderIconPicker.svelte"
  import NewSpacePage from "./NewSpacePage.svelte"
  import PinnedSection from "./PinnedSection.svelte"
  import { nudgeToward, slideAcross } from "./slide-across"
  import SpaceTitle from "./SpaceTitle.svelte"
  import SpotlightButton from "./SpotlightButton.svelte"
  import TemporarySection from "./TemporarySection.svelte"
  import ThemedSurface from "./ThemedSurface.svelte"
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
    pageOutputs: PageOutputAccess
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
    pageOutputs,
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
  const drag = new DragSession(
    () => ({ windowId: view.windowId, spaceId: activeSpace.id, canSplit: view.canSplit }),
    {
      windowId: () => view.windowId,
      run: (command) => void run(command),
    },
  )
  const themePicker = new ThemePickerController()
  const themeDraft = new ThemeDraft((draft) =>
    run({ _tag: "SetSpaceTheme", spaceId: draft.spaceId, theme: draft.theme }),
  )
  const tooltip = new TooltipController()
  const liveFolderDialog = new LiveFolderDialogController()
  const soundDialog = new SoundDialogController()
  const folderSearch = new FolderSearchController()
  const folderIconPicker = new FolderIconPickerController()
  const spaceDraft = new SpaceDraftController()
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
    spaceDraft,
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
    get pageOutputs() {
      return pageOutputs
    },
    get downloads() {
      return downloads
    },
    get sidePanel() {
      return sidePanel
    },
    liveFolderDialog,
    soundDialog,
    folderSearch,
    folderIconPicker,
  })

  let lastSwipeAt = Number.NEGATIVE_INFINITY
  let sidebar = $state<HTMLElement>()

  // Downloads belong to no Space, so their view takes the place of everything that shows one
  const isSpaceCovered = $derived(bodyPanel.current === "Downloads")

  const shownDraft = $derived(spaceDraft.isShownWith(activeSpace.id) ? spaceDraft.current : null)
  const spaceStripPage = $derived(shownDraft === null ? spacePage(activeSpace.id) : newSpacePage)
  const shownPage = $derived(isSpaceCovered ? downloadsPage : spaceStripPage)

  const spaceSlide = new SpaceSlide(
    untrack(() => view.spaces),
    untrack(() => spaceStripPage),
  )
  $effect.pre(() => spaceSlide.follow(view.spaces, spaceStripPage))
  $effect(() => spaceDraft.settleWith(activeSpace.id))

  const displayedTheme = $derived(
    shownDraft?.theme ?? themeDraft.themeFor(activeSpace.id) ?? activeSpace.theme,
  )

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

  // Downloads stay over the Space until it has switched, so it slides in once, already the one
  // swiped to
  const showSpace = async (spaceId: SpaceId) => {
    spaceDraft.discard()
    if (spaceId !== activeSpace.id) {
      await run({ _tag: "SwitchSpace", windowId: view.windowId, spaceId })
    }
    if (isSpaceCovered) bodyPanel.close()
  }

  const show = (page: SidebarPage) => {
    switch (page._tag) {
      case "Downloads":
        return bodyPanel.show("Downloads")
      case "NewSpace":
        return spaceDraft.open(newSpaceDraft(view.spaces, translator), activeSpace.id)
      case "Space":
        return void showSpace(page.spaceId)
    }
  }

  const switchByWheel = (event: WheelEvent) => {
    if (drag.source !== null || themePicker.current !== null) return
    const direction = detectSwipe(event, event.timeStamp - lastSwipeAt)
    if (Option.isNone(direction)) return
    lastSwipeAt = event.timeStamp
    const destination = swipeDestination(view.spaces, shownPage, direction.value)
    if (Option.isSome(destination)) show(destination.value)
    else if (sidebar !== undefined)
      nudgeToward(sidebar, oppositeSide(enteringSide(direction.value)))
  }

  const dropAccepted = (event: DragEvent) => {
    event.preventDefault()
    const outcome = drag.takeOutcome(event)
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

<ThemedSurface
  theme={displayedTheme}
  transitionKey={shownDraft === null ? activeSpace.id : "new-space"}
>
  <main
    bind:this={sidebar}
    class="sidebar"
    inert={dialog.current !== null ||
      liveFolderDialog.current !== null ||
      soundDialog.current !== null}
    onwheel={switchByWheel}
    ondragover={() => drag.reject()}
    ondrop={dropAccepted}
    ondragleave={forgetDropTargetWhenLeaving}
    ondragstart={() => tooltip.hide()}
  >
    <!-- Keyed rather than switching each part: the view being left has to keep its parts while it
         slides out -->
    {#key isSpaceCovered}
      <div
        class="view"
        in:slideAcross={{ side: isSpaceCovered ? "left" : "right" }}
        out:slideAcross={{ side: isSpaceCovered ? "right" : "left" }}
      >
        {#if !isSpaceCovered}
          <div class="top-bar">
            <SpotlightButton />
            <ClosePanelButton />
          </div>
        {/if}

        <div class="spaces">
          {#key shownDraft === null ? activeSpace.id : null}
            <div
              class="space"
              in:slideAcross={{ side: spaceSlide.entersFrom }}
              out:slideAcross={{ side: spaceSlide.leavesTo }}
            >
              {#if shownDraft !== null}
                <NewSpacePage draft={shownDraft} />
              {:else}
                {#if !isSpaceCovered}
                  <FavoritesGrid favorites={activeSpace.favorites} />
                  <SpaceTitle space={activeSpace} />
                {/if}
                <div class="space-pages">
                  {#if bodyPanel.current === "Archive"}
                    <div
                      class="space-body"
                      data-space-body
                      transition:slideAcross={{ side: "left" }}
                    >
                      {#await panels.archive then { default: ArchivePanel }}
                        <ArchivePanel spaceId={activeSpace.id} />
                      {/await}
                    </div>
                  {:else if bodyPanel.current === "Downloads"}
                    <div class="space-body">
                      {#await panels.downloads then { default: DownloadsPanel }}
                        <DownloadsPanel />
                      {/await}
                    </div>
                  {:else}
                    <div
                      class="space-body"
                      data-space-body
                      {@attach keepScrollPosition}
                      transition:slideAcross={{ side: "right" }}
                    >
                      <PinnedSection pinned={activeSpace.pinned} {onReload} />
                      <TemporarySection space={activeSpace} />
                    </div>
                  {/if}
                </div>
              {/if}
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
      </div>
    {/key}
  </main>

  {#await dialogs.themePicker then { default: ThemePicker }}<ThemePicker />{/await}
  <ContextMenu />
  {#await dialogs.folderSearch then { default: FolderSearch }}<FolderSearch />{/await}
  <FolderIconPicker />
  {#await dialogs.liveFolder then { default: LiveFolderDialog }}<LiveFolderDialog />{/await}
  {#await dialogs.sound then { default: SoundDialog }}<SoundDialog />{/await}
  <ConfirmDialog />
  <Tooltip />
</ThemedSurface>

<style>
  .sidebar {
    position: relative;
    height: 100%;
  }

  /* What slides out keeps the same cell as what slides in until it has gone. Clipped, not hidden:
     focus or scrollIntoView can scroll a hidden overflow and leave the contents shifted */
  .sidebar,
  .spaces,
  .space-pages {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-height: 0;
    overflow-x: clip;
  }

  .view,
  .space,
  .space-body {
    grid-area: 1 / 1;
  }

  .view {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .top-bar {
    display: flex;
    flex: none;
    gap: 4px;
    align-items: center;
    padding: 8px 8px 0;
  }

  .spaces,
  .space-pages {
    flex: 1;
  }

  .space {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .space-body {
    display: flex;
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
