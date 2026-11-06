<script lang="ts">
  import { Option } from "effect"
  import type { PinnedFolderView } from "#protocol"
  import {
    folderDropTarget,
    folderZoneAt,
    type DragSource,
    type DropTarget,
    type PinnedPosition,
  } from "../logic/drag-drop"
  import { bookmarkTitleChange } from "../logic/drafts"
  import { pointRect } from "../logic/menu-position"
  import { childPosition, selfAndDescendantFolderIds } from "../logic/view-queries"
  import { FolderExpansion } from "../state/folder-expansion.svelte"
  import { action } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import { disclose, DISCLOSURE_DURATION_MS } from "./disclose"
  import FolderGlyph from "./FolderGlyph.svelte"
  import FolderSearchButton from "./FolderSearchButton.svelte"
  import { addLiveFolderMenu, createFolder } from "./menus"
  import PinnedItemRow from "./PinnedItemRow.svelte"
  import PinnedNodes from "./PinnedNodes.svelte"
  import PinnedSplitRow from "./PinnedSplitRow.svelte"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    folder: PinnedFolderView
    position: PinnedPosition
  }

  const PEEK_EXIT_DURATION_MS = 160
  const PEEK_RETURN_DELAY_MS = DISCLOSURE_DURATION_MS * 0.4

  const { folder, position }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  let isEditing = $state(false)
  let headerRow = $state<HTMLDivElement>()
  let header = $state<HTMLButtonElement>()
  const key = $derived(`folder:${folder.bookmarkId}`)
  const emptyKey = $derived(`folder-empty:${folder.bookmarkId}`)
  const dropZone = $derived(ctx.drag.zoneFor(key))
  const isDragged = $derived(ctx.drag.sourceKey === key)
  const dragSource: DragSource = $derived({
    _tag: "PinnedFolder",
    bookmarkId: folder.bookmarkId,
    position,
    selfAndDescendantIds: selfAndDescendantFolderIds(folder),
  })
  const intoFolder: DropTarget = $derived({
    _tag: "Pinned",
    parentId: folder.bookmarkId,
    slot: folder.children.length,
  })

  $effect(() => {
    if (ctx.pendingRename.consume(folder.bookmarkId)) isEditing = true
  })

  const expansion = new FolderExpansion(
    () => folder.isExpanded,
    (isExpanded) =>
      ctx.run({ _tag: "SetFolderExpanded", bookmarkId: folder.bookmarkId, isExpanded }),
  )
  const isExpanded = $derived(expansion.isExpanded)

  const setExpanded = (next: boolean) => void expansion.set(next)

  const toggle = (event: MouseEvent) => {
    if (event.detail > 1) return
    setExpanded(!isExpanded)
  }

  const rename = (draft: string) => {
    isEditing = false
    const change = bookmarkTitleChange(draft, folder.title)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenamePinnedItem", bookmarkId: folder.bookmarkId, title: change.value })
    }
  }

  const createSubfolder = () => {
    if (!isExpanded) setExpanded(true)
    void createFolder(ctx, folder.bookmarkId)
  }

  const confirmDeletion = async () => {
    const confirmed = await ctx.dialog.confirm({
      title: t("sidepanel.folder.deleteTitle"),
      message: t("sidepanel.folder.deleteMessage", { title: folder.title }),
      confirmLabel: t("common.delete"),
    })
    if (confirmed) void ctx.run({ _tag: "DeleteFolder", bookmarkId: folder.bookmarkId })
  }

  const openIconPicker = () => {
    if (headerRow === undefined || header === undefined) return
    ctx.folderIconPicker.open({
      bookmarkId: folder.bookmarkId,
      anchor: headerRow.getBoundingClientRect(),
      trigger: header,
    })
  }

  const openMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    ctx.menu.open({
      label: t("sidepanel.folder.menu"),
      anchor: pointRect({ x: event.clientX, y: event.clientY }),
      trigger: null,
      entries: [
        ...(folder.canCreateSubfolder
          ? [
              action(t("common.newFolder"), createSubfolder),
              addLiveFolderMenu(ctx, folder.bookmarkId),
            ]
          : []),
        action(t("common.rename"), () => (isEditing = true)),
        action(t("sidepanel.folder.changeIcon"), openIconPicker),
        action(t("sidepanel.folder.delete"), () => void confirmDeletion(), { tone: "danger" }),
      ],
    })
  }

  const onHeaderDragOver = (event: DragEvent & { currentTarget: HTMLElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const zone = folderZoneAt(event.clientY - bounds.top, bounds.height, isExpanded)
    const target = folderDropTarget(
      { bookmarkId: folder.bookmarkId, position, childCount: folder.children.length },
      zone,
    )
    ctx.drag.offer(event, key, zone, target)
    if (zone === "into" && !isExpanded && ctx.drag.accepts(target)) {
      ctx.drag.hoverFor(key, () => setExpanded(true))
    }
  }
</script>

{#snippet glyph()}
  <span class="folder-icon">
    <FolderGlyph isOpen={isExpanded} icon={folder.icon} />
  </span>
{/snippet}

<li class="folder" class:dragged={isDragged}>
  <div class="header-row" class:searchable={!isExpanded} bind:this={headerRow}>
    {#if isEditing}
      <div class="header editing">
        {@render glyph()}
        <TitleEditor
          initial={folder.title}
          label={t("sidepanel.folder.nameLabel")}
          onCommit={rename}
          onCancel={() => (isEditing = false)}
        />
      </div>
    {:else}
      <button
        bind:this={header}
        class="header"
        class:drop-before={dropZone === "before"}
        class:drop-after={dropZone === "after"}
        class:drop-into={dropZone === "into"}
        class:drop-first-child={dropZone === "firstChild"}
        type="button"
        aria-expanded={isExpanded}
        draggable="true"
        onclick={toggle}
        ondblclick={() => (isEditing = true)}
        oncontextmenu={openMenu}
        ondragstart={(event) => ctx.drag.begin(event, key, dragSource)}
        ondragend={(event) => ctx.drag.finish(event)}
        ondragover={onHeaderDragOver}
        ondragleave={() => ctx.drag.cancelHover()}
      >
        {@render glyph()}
        <span class="title">{folder.title || t("sidepanel.folder.untitled")}</span>
      </button>
      {#if !isExpanded && headerRow !== undefined}
        <FolderSearchButton bookmarkId={folder.bookmarkId} anchor={headerRow} />
      {/if}
    {/if}
  </div>

  {#if isExpanded}
    <div class="contents" transition:disclose>
      {#if folder.children.length === 0}
        <p
          class="empty"
          class:drop-into={ctx.drag.zoneFor(emptyKey) !== null}
          ondragover={(event) => ctx.drag.offer(event, emptyKey, "into", intoFolder)}
        >
          {t("sidepanel.folder.dropHere")}
        </p>
      {:else}
        <PinnedNodes nodes={folder.children} parentId={folder.bookmarkId} />
      {/if}
    </div>
  {:else if folder.peekedItems.length > 0}
    <!-- The rows peeked out are among the folder's contents. Gone quickly as the folder opens, and
         back only once its contents have mostly closed, so that they aren't seen twice -->
    <ul
      class="peek"
      in:disclose={{ delay: PEEK_RETURN_DELAY_MS }}
      out:disclose={{ duration: PEEK_EXIT_DURATION_MS }}
    >
      {#each folder.peekedItems as node (node.bookmarkId)}
        {#if node._tag === "PinnedSplit"}
          <PinnedSplitRow
            split={node}
            position={childPosition(folder, node.bookmarkId)}
            dropTargetAt={() => intoFolder}
          />
        {:else}
          <PinnedItemRow
            item={node}
            position={childPosition(folder, node.bookmarkId)}
            dropTargetAt={() => intoFolder}
          />
        {/if}
      {/each}
    </ul>
  {/if}
</li>

<style>
  .folder {
    list-style: none;
    transition: opacity 120ms ease;
  }

  .folder.dragged {
    opacity: 0.4;
  }

  .header-row {
    position: relative;
  }

  /* Its own formatting context, so the margins inside don't collapse through it: they would while
     it rests and not while it slides, and the height would jump at both ends */
  .contents {
    display: flow-root;
  }

  .header-row.searchable .header {
    padding-right: 34px;
  }

  .header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: var(--row-height);
    padding: 0 10px 0 9px;
    border: none;
    border-radius: var(--radius-row);
    background: none;
    font-size: 14px;
    font-weight: 700;
    text-align: start;
    transition: background-color 120ms ease;
  }

  button.header:hover {
    background: var(--surface-hover);
  }

  .header.drop-into {
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1.5px var(--drop-line);
  }

  .folder-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .header.drop-before::before,
  .header.drop-after::after,
  .header.drop-first-child::after {
    position: absolute;
    right: 8px;
    left: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .header.drop-before::before {
    top: -2px;
  }

  .header.drop-after::after {
    bottom: -2px;
  }

  .header.drop-first-child::after {
    bottom: -2px;
    left: 26px;
  }

  .header :global(.title-editor) {
    font-weight: 700;
  }

  .empty {
    display: flex;
    align-items: center;
    height: 30px;
    margin: 2px 0 2px 16px;
    padding: 0 10px;
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 12px;
    transition: background-color 120ms ease;
  }

  .empty.drop-into {
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1.5px var(--drop-line);
  }

  .peek {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 2px 16px;
    padding: 0;
  }
</style>
