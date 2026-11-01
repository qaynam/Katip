<script lang="ts" module>
  import type { TabId } from "#platform/browser"

  export interface SplitHalf {
    /** 閉じているピンでは null */
    readonly tabId: TabId | null
    readonly title: string
    readonly pageUrl: string
    readonly favIconUrl: string | null
    readonly isActive: boolean
    readonly isLoading: boolean
    readonly isAudible: boolean
    readonly isMuted: boolean
    readonly isDiscarded: boolean
    readonly renameInitial: string
    readonly onRename: (draft: string) => void
    readonly onActivate: () => void
    /** 指定すると閉じるボタンと中クリックで閉じられる */
    readonly onClose: (() => void) | undefined
  }
</script>

<script lang="ts">
  import { edgeAt, type DragSource, type DropTarget, type Edge } from "../logic/drag-drop"
  import { pointRect } from "../logic/menu-position"
  import type { MenuEntry } from "../state/menu-controller.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"
  import Icon from "./Icon.svelte"
  import TitleEditor from "./TitleEditor.svelte"

  interface Props {
    rowKey: string
    /** 左、右の順 */
    halves: readonly [SplitHalf, SplitHalf]
    menuLabel: string
    /** half はメニューを開いた側。半分の外（隙間）で開いたときは左 */
    menuEntries: (half: SplitHalf, startRename: () => void) => ReadonlyArray<MenuEntry>
    dragSource: DragSource
    dropTargetAt: (edge: Edge) => DropTarget | null
  }

  const { rowKey, halves, menuLabel, menuEntries, dragSource, dropTargetAt }: Props = $props()

  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  let row = $state<HTMLLIElement>()
  let editingIndex = $state<number | null>(null)
  const dropZone = $derived(ctx.drag.zoneFor(rowKey))
  const isDragged = $derived(ctx.drag.sourceKey === rowKey)
  const isActive = $derived(halves.some((half) => half.isActive))
  const isClosed = $derived(halves.every((half) => half.tabId === null))

  $effect(() => {
    if (isActive) row?.scrollIntoView({ block: "nearest" })
  })

  const startRename = (index: number) => {
    ctx.tooltip.hide()
    editingIndex = index
  }

  const finishRename = (half: SplitHalf, draft: string) => {
    editingIndex = null
    half.onRename(draft)
  }

  const activate = (event: MouseEvent, half: SplitHalf) => {
    if (event.detail > 1) return
    half.onActivate()
  }

  const closeOnMiddleClick = (event: MouseEvent, half: SplitHalf) => {
    if (event.button !== 1 || half.onClose === undefined) return
    event.preventDefault()
    half.onClose()
  }

  const suppressAutoscroll = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault()
  }

  const openMenu = (event: MouseEvent, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    ctx.tooltip.hide()
    const isFromKeyboard = event.clientX === 0 && event.clientY === 0
    const anchor =
      isFromKeyboard && row !== undefined
        ? row.getBoundingClientRect()
        : pointRect({ x: event.clientX, y: event.clientY })
    const half = halves[index === 1 ? 1 : 0]
    ctx.menu.open({
      label: menuLabel,
      anchor,
      entries: menuEntries(half, () => startRename(index)),
      trigger: null,
    })
  }

  const onDragOver = (event: DragEvent & { currentTarget: HTMLLIElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientY - bounds.top, bounds.height)
    ctx.drag.offer(event, rowKey, edge, dropTargetAt(edge))
  }

  const scheduleTooltip = (event: PointerEvent, half: SplitHalf) => {
    if (editingIndex !== null || ctx.drag.source !== null) return
    ctx.tooltip.schedule(
      { title: half.title, hint: t("sidepanel.tab.renameHint") },
      { x: event.clientX, y: event.clientY },
    )
  }
</script>

<li
  bind:this={row}
  class="split"
  class:active={isActive}
  class:closed={isClosed}
  class:dragged={isDragged}
  class:drop-before={dropZone === "before"}
  class:drop-after={dropZone === "after"}
  draggable={editingIndex === null}
  ondragstart={(event) => ctx.drag.begin(event, rowKey, dragSource)}
  ondragend={() => ctx.drag.end()}
  ondragover={onDragOver}
  oncontextmenu={(event) => openMenu(event, 0)}
>
  {#each halves as half, index (index)}
    <div
      class="half"
      role="group"
      aria-label={half.title}
      class:active={half.isActive}
      class:closed={half.tabId === null}
      class:discarded={half.isDiscarded}
      data-tab-id={half.tabId}
      oncontextmenu={(event) => openMenu(event, index)}
      onauxclick={(event) => closeOnMiddleClick(event, half)}
      onpointerenter={(event) => scheduleTooltip(event, half)}
      onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
      onpointerleave={() => ctx.tooltip.hide()}
      onpointerdown={() => ctx.tooltip.hide()}
    >
      {#if editingIndex === index}
        <span class="favicon">
          <Favicon pageUrl={half.pageUrl} favIconUrl={half.favIconUrl} title={half.title} />
        </span>
        <TitleEditor
          initial={half.renameInitial}
          label={t("sidepanel.tab.nameLabel")}
          onCommit={(draft) => finishRename(half, draft)}
          onCancel={() => (editingIndex = null)}
        />
      {:else}
        <button
          class="main"
          type="button"
          aria-current={half.isActive ? "true" : undefined}
          onclick={(event) => activate(event, half)}
          ondblclick={() => startRename(index)}
          onmousedown={suppressAutoscroll}
        >
          <span class="favicon" class:loading={half.isLoading}>
            <Favicon pageUrl={half.pageUrl} favIconUrl={half.favIconUrl} title={half.title} />
          </span>
          <span class="title">{half.title}</span>
        </button>

        {#if half.isAudible || half.isMuted}
          <span
            class="audio"
            role="img"
            aria-label={t(half.isMuted ? "sidepanel.tab.muted" : "sidepanel.tab.playingAudio")}
          >
            <Icon name={half.isMuted ? "speakerMuted" : "speaker"} size={13} />
          </span>
        {/if}

        {#if half.onClose !== undefined}
          <button
            class="close"
            type="button"
            aria-label={t("actions.closeTab")}
            onclick={half.onClose}
          >
            <Icon name="close" size={12} />
          </button>
        {/if}
      {/if}
    </div>
  {/each}
</li>

<style>
  .split {
    --half-radius: calc(var(--radius-row) - 3px);

    position: relative;
    display: flex;
    gap: 3px;
    min-height: var(--row-height);
    padding: 3px;
    border-radius: var(--radius-row);
    background: var(--surface-hover);
    list-style: none;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .split:hover {
    background: var(--surface-raised);
  }

  .split.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
  }

  .split.closed:not(:hover) {
    background: none;
    box-shadow: inset 0 0 0 1px var(--divider);
  }

  .split.dragged {
    opacity: 0.4;
  }

  .half {
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    gap: 1px;
    min-width: 0;
    padding: 0 3px 0 8px;
    border-radius: var(--half-radius);
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .half:hover {
    background: var(--surface-hover);
  }

  .split:not(.active) .half + .half::before {
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: -2px;
    width: 1px;
    background: var(--divider);
    content: "";
  }

  .split:not(.active):hover .half + .half::before {
    opacity: 0;
  }

  .split.active .half {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .split.active .half:not(.active):hover {
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }

  .split.active .half.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
  }

  .half.discarded:not(.active) .favicon,
  .half.discarded:not(.active) .title {
    opacity: 0.7;
  }

  .half.closed .title {
    color: var(--text-muted);
  }

  .half.closed .favicon {
    opacity: 0.6;
    filter: saturate(0.4);
  }

  .main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: calc(var(--row-height) - 6px);
    padding: 0;
    border: none;
    background: none;
    text-align: start;
  }

  .main:focus-visible {
    outline: none;
  }

  .half:has(.main:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .title {
    overflow: hidden;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.003em;
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

  .audio {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    color: var(--text-muted);
  }

  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 100ms ease;
  }

  .half:hover .close,
  .close:focus-visible {
    opacity: 1;
  }

  .close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .split.drop-before::before,
  .split.drop-after::after {
    position: absolute;
    right: 8px;
    left: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .split.drop-before::before {
    top: -2px;
  }

  .split.drop-after::after {
    bottom: -2px;
  }

  .half :global(.title-editor) {
    height: 24px;
    margin-left: 6px;
    font-size: 14px;
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
