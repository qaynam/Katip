<script lang="ts">
  import { Option } from "effect"
  import type { PinnedLiveFolderView } from "#protocol"
  import { edgeAt, slotAt, type PinnedPosition } from "../logic/drag-drop"
  import { bookmarkTitleChange } from "../logic/drafts"
  import { unseenBadgeText, unseenCount } from "../logic/live-folders"
  import { pointRect } from "../logic/menu-position"
  import { messages } from "../messages"
  import { getSidebarContext } from "../state/sidebar-context"
  import FolderSearchButton from "./FolderSearchButton.svelte"
  import Icon from "./Icon.svelte"
  import LiveItemRow from "./LiveItemRow.svelte"
  import LiveSourceGlyph from "./LiveSourceGlyph.svelte"
  import { grantAccessAndRefresh, liveFolderMenu, openSignInPage } from "./menus"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    folder: PinnedLiveFolderView
    position: PinnedPosition
  }

  const { folder, position }: Props = $props()
  const ctx = getSidebarContext()

  let isEditing = $state(false)
  let headerRow = $state<HTMLDivElement>()
  const key = $derived(`live-folder:${folder.bookmarkId}`)
  const dropZone = $derived(ctx.drag.zoneFor(key))
  const unseen = $derived(unseenCount(folder))
  const failure = $derived(folder.status._tag === "Failed" ? folder.status : null)
  const title = $derived(folder.title || messages.liveFolder.untitled)

  const toggle = (event: MouseEvent) => {
    if (event.detail > 1) return
    void ctx.run({
      _tag: "SetFolderExpanded",
      bookmarkId: folder.bookmarkId,
      isExpanded: !folder.isExpanded,
    })
  }

  const startRename = () => {
    ctx.tooltip.hide()
    isEditing = true
  }

  const rename = (draft: string) => {
    isEditing = false
    const change = bookmarkTitleChange(draft, folder.title)
    if (Option.isSome(change)) {
      void ctx.run({ _tag: "RenamePinnedItem", bookmarkId: folder.bookmarkId, title: change.value })
    }
  }

  const refresh = () => void ctx.run({ _tag: "RefreshLiveFolder", bookmarkId: folder.bookmarkId })

  const setToken = () =>
    ctx.liveFolderDialog.open({ _tag: "SetGitHubToken", bookmarkId: folder.bookmarkId })

  const openMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    ctx.tooltip.hide()
    const isFromKeyboard = event.clientX === 0 && event.clientY === 0
    ctx.menu.open({
      label: messages.liveFolder.menuLabel,
      anchor:
        isFromKeyboard && headerRow !== undefined
          ? headerRow.getBoundingClientRect()
          : pointRect({ x: event.clientX, y: event.clientY }),
      trigger: null,
      entries: liveFolderMenu(ctx, folder, { startRename }),
    })
  }

  // 中身は取得元が決めるので、ドロップは中へ入れずに前後への並べ替えだけを受け付ける
  const onHeaderDragOver = (event: DragEvent & { currentTarget: HTMLElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientY - bounds.top, bounds.height)
    ctx.drag.offer(event, key, edge, {
      _tag: "Pinned",
      parentId: position.parentId,
      slot: slotAt(position.index, edge),
    })
  }
</script>

<li class="live-folder">
  <div
    class="header-row"
    class:searchable={!folder.isExpanded}
    class:has-badge={unseen > 0}
    bind:this={headerRow}
  >
    {#if isEditing}
      <div class="header editing">
        <span class="glyph"><LiveSourceGlyph kind={folder.source._tag} /></span>
        <TitleEditor
          initial={folder.title}
          label={messages.liveFolder.titleLabel}
          onCommit={rename}
          onCancel={() => (isEditing = false)}
        />
      </div>
    {:else}
      <button
        class="header"
        class:drop-before={dropZone === "before"}
        class:drop-after={dropZone === "after"}
        type="button"
        aria-expanded={folder.isExpanded}
        onclick={toggle}
        ondblclick={startRename}
        oncontextmenu={openMenu}
        ondragover={onHeaderDragOver}
      >
        <span class="glyph"><LiveSourceGlyph kind={folder.source._tag} /></span>
        <span class="title">{title}</span>
        {#if folder.status._tag === "Refreshing"}
          <span class="spinner" aria-hidden="true"></span>
          <span class="visually-hidden">{messages.liveFolder.refreshing}</span>
        {:else if failure !== null}
          <span class="failed-mark" aria-hidden="true"><Icon name="alert" size={13} /></span>
          <span class="visually-hidden">{messages.liveFolder.failed}</span>
        {/if}
        {#if unseen > 0}
          <span class="badge" aria-hidden="true">{unseenBadgeText(unseen)}</span>
          <span class="visually-hidden">{messages.liveFolder.unseenCount(unseen)}</span>
        {/if}
      </button>
      {#if !folder.isExpanded && headerRow !== undefined}
        <FolderSearchButton bookmarkId={folder.bookmarkId} anchor={headerRow} />
      {/if}
    {/if}
  </div>

  {#if folder.isExpanded}
    {#if failure !== null}
      <div class="failure">
        <p class="reason">{failure.reason}</p>
        <div class="actions">
          {#if failure.needsPermission}
            <button type="button" onclick={() => void grantAccessAndRefresh(ctx, folder)}>
              {messages.liveFolder.grantAccess}
            </button>
          {/if}
          {#if failure.signInUrl !== null}
            {@const signInUrl = failure.signInUrl}
            <button type="button" onclick={() => openSignInPage(ctx, signInUrl)}>
              {messages.liveFolder.signIn}
            </button>
          {/if}
          {#if failure.needsToken}
            <button type="button" onclick={setToken}>{messages.liveFolder.setToken}</button>
          {/if}
          {#if !failure.needsPermission && !failure.needsToken}
            <button type="button" onclick={refresh}>{messages.liveFolder.retry}</button>
          {/if}
        </div>
      </div>
    {/if}
    {#if folder.items.length > 0}
      <ul class="items">
        {#each folder.items as item (item.id)}
          <LiveItemRow {item} folderId={folder.bookmarkId} />
        {/each}
      </ul>
    {:else if failure === null}
      <p class="empty">
        {folder.status._tag === "Refreshing"
          ? messages.liveFolder.loading
          : messages.liveFolder.empty}
      </p>
    {/if}
  {/if}
</li>

<style>
  .live-folder {
    list-style: none;
  }

  .header-row {
    position: relative;
  }

  .header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: var(--row-height);
    padding: 0 10px;
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

  .header-row.searchable:not(.has-badge) .header {
    padding-right: 34px;
  }

  .glyph {
    display: grid;
    flex: none;
    place-items: center;
    width: 17px;
    color: var(--text);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .badge {
    flex: none;
    min-width: 20px;
    height: 18px;
    padding: 0 6px;
    border-radius: 9px;
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    transition: opacity 120ms ease;
  }

  .header-row.searchable:hover .badge,
  .header-row.searchable:focus-within .badge {
    opacity: 0;
  }

  .spinner {
    flex: none;
    width: 11px;
    height: 11px;
    border: 1.5px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
    color: var(--text-muted);
    animation: spin 0.9s linear infinite;
  }

  .failed-mark {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--danger);
  }

  .header.drop-before::before,
  .header.drop-after::after {
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

  .header :global(.title-editor) {
    font-weight: 700;
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 2px 0 2px 16px;
    padding: 0;
  }

  .empty {
    display: flex;
    align-items: center;
    height: 30px;
    margin: 2px 0 2px 16px;
    padding: 0 10px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .failure {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 2px 0 4px 16px;
    padding: 10px 12px;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
    font-size: 12px;
  }

  .reason {
    margin: 0;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .actions button {
    height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    font-size: 12px;
    font-weight: 600;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
