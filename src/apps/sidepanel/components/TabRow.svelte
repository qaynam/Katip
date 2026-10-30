<script lang="ts">
  import type { TabId } from "#platform/browser"
  import { edgeAt, type DragSource, type DropTarget, type Edge } from "../logic/drag-drop"
  import { pointRect } from "../logic/menu-position"
  import type { MenuEntry } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"
  import Icon from "./Icon.svelte"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    rowKey: string
    tabId: TabId | null
    title: string
    pageUrl: string
    favIconUrl: string | null
    isOpen: boolean
    isActive?: boolean
    isLoading?: boolean
    isAudible?: boolean
    isMuted?: boolean
    isDiscarded?: boolean
    /** 指定すると favicon が「ピンした URL に戻る」ボタンになり、タイトルの前に「/」が付く */
    onReturnToPinnedUrl?: (() => void) | undefined
    renameInitial: string
    onRename: (draft: string) => void
    onActivate: () => void
    /** 指定すると閉じるボタンと中クリックで閉じられる */
    onClose?: (() => void) | undefined
    menuLabel: string
    menuEntries: (startRename: () => void) => ReadonlyArray<MenuEntry>
    dragSource: DragSource
    dropTargetAt: (edge: Edge) => DropTarget | null
  }

  const {
    rowKey,
    tabId,
    title,
    pageUrl,
    favIconUrl,
    isOpen,
    isActive = false,
    isLoading = false,
    isAudible = false,
    isMuted = false,
    isDiscarded = false,
    onReturnToPinnedUrl,
    renameInitial,
    onRename,
    onActivate,
    onClose,
    menuLabel,
    menuEntries,
    dragSource,
    dropTargetAt,
  }: Props = $props()

  const ctx = getSidebarContext()
  let row = $state<HTMLLIElement>()
  let isEditing = $state(false)
  const dropZone = $derived(ctx.drag.zoneFor(rowKey))
  const isDragged = $derived(ctx.drag.sourceKey === rowKey)

  // 読み込み状態などの変化では動かさず、アクティブになった瞬間だけ追いかける。
  // isActive を直接読むと、親のタブ情報が更新されるたびに値が同じでも再実行されてしまう
  const isActiveNow = $derived(isActive)
  $effect(() => {
    if (isActiveNow) row?.scrollIntoView({ block: "nearest" })
  })

  const startRename = () => {
    isEditing = true
  }

  const finishRename = (draft: string) => {
    isEditing = false
    onRename(draft)
  }

  const activate = (event: MouseEvent) => {
    if (event.detail > 1) return
    onActivate()
  }

  const closeOnMiddleClick = (event: MouseEvent) => {
    if (event.button !== 1 || onClose === undefined) return
    event.preventDefault()
    onClose()
  }

  const suppressAutoscroll = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault()
  }

  const openMenu = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const isFromKeyboard = event.clientX === 0 && event.clientY === 0
    const anchor =
      isFromKeyboard && row !== undefined
        ? row.getBoundingClientRect()
        : pointRect({ x: event.clientX, y: event.clientY })
    ctx.menu.open({ label: menuLabel, anchor, entries: menuEntries(startRename), trigger: null })
  }

  const onDragOver = (event: DragEvent & { currentTarget: HTMLLIElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientY - bounds.top, bounds.height)
    ctx.drag.offer(event, rowKey, edge, dropTargetAt(edge))
  }
</script>

<li
  bind:this={row}
  class="row"
  class:active={isActive}
  class:closed={!isOpen}
  class:discarded={isDiscarded}
  class:dragged={isDragged}
  class:drop-before={dropZone === "before"}
  class:drop-after={dropZone === "after"}
  data-tab-id={tabId}
  draggable={!isEditing}
  ondragstart={(event) => ctx.drag.begin(event, rowKey, dragSource)}
  ondragend={() => ctx.drag.end()}
  ondragover={onDragOver}
  oncontextmenu={openMenu}
  onauxclick={closeOnMiddleClick}
>
  {#if onReturnToPinnedUrl !== undefined}
    <button
      class="return-button"
      type="button"
      aria-label="ピンした URL に戻る"
      title="ピンした URL に戻る"
      onclick={onReturnToPinnedUrl}
    >
      <span class="favicon"><Favicon {pageUrl} {favIconUrl} {title} /></span>
      <span class="return-glyph"><Icon name="undo" size={14} /></span>
    </button>
  {/if}

  {#if isEditing}
    {#if onReturnToPinnedUrl === undefined}
      <span class="favicon"><Favicon {pageUrl} {favIconUrl} {title} /></span>
    {/if}
    <TitleEditor
      initial={renameInitial}
      label="名前"
      onCommit={finishRename}
      onCancel={() => (isEditing = false)}
    />
  {:else}
    <button
      class="main"
      type="button"
      aria-current={isActive ? "true" : undefined}
      {title}
      onclick={activate}
      ondblclick={startRename}
      onmousedown={suppressAutoscroll}
    >
      {#if onReturnToPinnedUrl === undefined}
        <span class="favicon" class:loading={isLoading}>
          <Favicon {pageUrl} {favIconUrl} {title} />
        </span>
      {:else}
        <span class="slash" aria-hidden="true">/</span>
      {/if}
      <span class="title">{title}</span>
    </button>
  {/if}

  {#if isAudible || isMuted}
    <span class="audio" role="img" aria-label={isMuted ? "ミュート中" : "音声を再生中"}>
      <Icon name={isMuted ? "speakerMuted" : "speaker"} size={14} />
    </span>
  {/if}

  {#if onClose !== undefined && !isEditing}
    <button class="close" type="button" aria-label="タブを閉じる" title="閉じる" onclick={onClose}>
      <Icon name="close" size={14} />
    </button>
  {/if}
</li>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 34px;
    padding: 0 4px 0 10px;
    border-radius: var(--radius-row);
    list-style: none;
    transition: background-color 120ms ease;
  }

  .row:hover {
    background: var(--space-bg-hover);
  }

  .row.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text-on-surface);
  }

  .row.dragged {
    opacity: 0.4;
  }

  .row.discarded:not(.active) .favicon,
  .row.discarded:not(.active) .title {
    opacity: 0.7;
  }

  .row.closed:not(.active) .title {
    color: var(--text-muted);
  }

  .row.closed:not(.active) .favicon {
    opacity: 0.55;
    filter: saturate(0.4);
  }

  .main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 9px;
    min-width: 0;
    height: 34px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: default;
  }

  .main:focus-visible {
    outline: none;
  }

  .row:has(.main:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .favicon {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
  }

  .favicon.loading::after {
    position: absolute;
    inset: -3px;
    border: 1.5px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    content: "";
  }

  .return-button {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    margin: 0 4px 0 -4px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: inherit;
  }

  .return-glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--surface-active);
    color: var(--text-on-surface);
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .return-button:hover .return-glyph,
  .return-button:focus-visible .return-glyph {
    opacity: 1;
  }

  .slash {
    flex: none;
    margin-right: -4px;
    color: var(--text-muted);
    font-weight: 600;
  }

  .audio {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    color: var(--text-muted);
  }

  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: inherit;
    opacity: 0;
  }

  .row:hover .close,
  .row.active .close,
  .close:focus-visible {
    opacity: 0.7;
  }

  .close:hover {
    background: color-mix(in srgb, currentColor 12%, transparent);
    opacity: 1;
  }

  .row.drop-before::before,
  .row.drop-after::after {
    position: absolute;
    right: 8px;
    left: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .row.drop-before::before {
    top: -2px;
  }

  .row.drop-after::after {
    bottom: -2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .favicon.loading::after {
      animation: none;
      border-color: currentColor;
      opacity: 0.4;
    }
  }
</style>
