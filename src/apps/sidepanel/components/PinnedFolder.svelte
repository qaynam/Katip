<script lang="ts">
  import { Option } from "effect"
  import type { PinnedFolderView } from "#protocol"
  import {
    folderDropTarget,
    folderZoneAt,
    type DropTarget,
    type PinnedPosition,
  } from "../logic/drag-drop"
  import { bookmarkTitleChange } from "../logic/drafts"
  import { pointRect } from "../logic/menu-position"
  import { childPosition } from "../logic/view-queries"
  import { action } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import { createFolder } from "./menus"
  import PinnedItemRow from "./PinnedItemRow.svelte"
  import PinnedNodes from "./PinnedNodes.svelte"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    folder: PinnedFolderView
    position: PinnedPosition
  }

  const { folder, position }: Props = $props()
  const ctx = getSidebarContext()

  let isEditing = $state(false)
  const key = $derived(`folder:${folder.bookmarkId}`)
  const emptyKey = $derived(`folder-empty:${folder.bookmarkId}`)
  const dropZone = $derived(ctx.drag.zoneFor(key))
  const intoFolder: DropTarget = $derived({
    _tag: "Pinned",
    parentId: folder.bookmarkId,
    slot: folder.children.length,
  })

  $effect(() => {
    if (ctx.pendingRename.consume(folder.bookmarkId)) isEditing = true
  })

  const setExpanded = (isExpanded: boolean) =>
    void ctx.run({ _tag: "SetFolderExpanded", bookmarkId: folder.bookmarkId, isExpanded })

  const toggle = (event: MouseEvent) => {
    if (event.detail > 1) return
    setExpanded(!folder.isExpanded)
  }

  const rename = (draft: string) => {
    isEditing = false
    const change = bookmarkTitleChange(draft, folder.title)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenamePinnedItem", bookmarkId: folder.bookmarkId, title: change.value })
    }
  }

  const createSubfolder = () => {
    if (!folder.isExpanded) setExpanded(true)
    void createFolder(ctx, folder.bookmarkId)
  }

  const confirmDeletion = async () => {
    const confirmed = await ctx.dialog.confirm({
      title: "フォルダを削除しますか？",
      message: `「${folder.title}」と、その中のピンとフォルダをすべて削除します。`,
      confirmLabel: "削除",
    })
    if (confirmed) void ctx.run({ _tag: "DeleteFolder", bookmarkId: folder.bookmarkId })
  }

  const openMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    ctx.menu.open({
      label: "フォルダのメニュー",
      anchor: pointRect({ x: event.clientX, y: event.clientY }),
      trigger: null,
      entries: [
        ...(folder.canCreateSubfolder ? [action("新しいフォルダ", createSubfolder)] : []),
        action("名前を変更", () => (isEditing = true)),
        action("フォルダを削除", () => void confirmDeletion(), { tone: "danger" }),
      ],
    })
  }

  const onHeaderDragOver = (event: DragEvent & { currentTarget: HTMLElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const zone = folderZoneAt(event.clientY - bounds.top, bounds.height, folder.isExpanded)
    const target = folderDropTarget(
      { bookmarkId: folder.bookmarkId, position, childCount: folder.children.length },
      zone,
    )
    ctx.drag.offer(event, key, zone, target)
    if (zone === "into" && !folder.isExpanded && ctx.drag.source !== null) {
      ctx.drag.hoverFor(key, () => setExpanded(true))
    }
  }
</script>

<li class="folder">
  {#if isEditing}
    <div class="header editing">
      <span class="folder-icon"><Icon name="folderOpen" /></span>
      <TitleEditor
        initial={folder.title}
        label="フォルダの名前"
        onCommit={rename}
        onCancel={() => (isEditing = false)}
      />
    </div>
  {:else}
    <button
      class="header"
      class:drop-before={dropZone === "before"}
      class:drop-after={dropZone === "after"}
      class:drop-into={dropZone === "into"}
      class:drop-first-child={dropZone === "firstChild"}
      type="button"
      aria-expanded={folder.isExpanded}
      onclick={toggle}
      ondblclick={() => (isEditing = true)}
      oncontextmenu={openMenu}
      ondragover={onHeaderDragOver}
      ondragleave={() => ctx.drag.cancelHover()}
    >
      <span class="folder-icon" class:peeking={!folder.isExpanded && folder.peekedItems.length > 0}>
        <Icon name={folder.isExpanded ? "folderOpen" : "folder"} />
      </span>
      <span class="title">{folder.title || "名前のないフォルダ"}</span>
      <span class="chevron" class:expanded={folder.isExpanded}>
        <Icon name="chevronRight" size={12} />
      </span>
    </button>
  {/if}

  {#if folder.isExpanded}
    {#if folder.children.length === 0}
      <p
        class="empty"
        class:drop-into={ctx.drag.zoneFor(emptyKey) !== null}
        ondragover={(event) => ctx.drag.offer(event, emptyKey, "into", intoFolder)}
      >
        ここにドラッグして追加
      </p>
    {:else}
      <PinnedNodes nodes={folder.children} parentId={folder.bookmarkId} />
    {/if}
  {:else if folder.peekedItems.length > 0}
    <ul class="peek">
      {#each folder.peekedItems as item (item.bookmarkId)}
        <PinnedItemRow
          {item}
          position={childPosition(folder, item.bookmarkId)}
          dropTargetAt={() => intoFolder}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .folder {
    list-style: none;
  }

  .header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-row);
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: start;
    cursor: default;
    transition: background-color 120ms ease;
  }

  button.header:hover {
    background: var(--space-bg-hover);
  }

  .header.drop-into {
    background: var(--surface-raised-hover);
    box-shadow: inset 0 0 0 1.5px var(--drop-line);
  }

  .folder-icon {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    color: var(--text-muted);
  }

  .folder-icon.peeking::after {
    position: absolute;
    right: -3px;
    bottom: -1px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    content: "";
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chevron {
    display: grid;
    place-items: center;
    color: var(--text-muted);
    opacity: 0;
    transition:
      transform 150ms ease,
      opacity 120ms ease;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .header:hover .chevron,
  .header:focus-visible .chevron {
    opacity: 1;
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
    left: 32px;
  }

  .empty {
    margin: 2px 0 4px 23px;
    padding: 8px 10px;
    border: 1px dashed var(--rule);
    border-radius: 8px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .empty.drop-into {
    border-color: var(--drop-line);
    background: var(--surface-raised);
  }

  .peek {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 2px 17px;
    padding: 0 0 0 6px;
    border-left: 1px dashed var(--rule);
  }
</style>
