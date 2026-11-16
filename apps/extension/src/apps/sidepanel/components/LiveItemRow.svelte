<script lang="ts">
  import type { BookmarkId } from "#platform/browser"
  import type { LiveItemView } from "#protocol"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import LiveItemIcon from "./LiveItemIcon.svelte"

  interface Props {
    item: LiveItemView
    folderId: BookmarkId
  }

  const { item, folderId }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  let row = $state<HTMLLIElement>()
  const openTab = $derived(item.openTab)
  const isActive = $derived(openTab?.isActive ?? false)

  // Through isActive, not openTab: reading the tab directly would rerun this on every update of
  // it, such as its loading state, and scroll the row back into view each time
  $effect(() => {
    if (isActive) row?.scrollIntoView({ block: "nearest" })
  })

  const activate = () =>
    void ctx.run(
      openTab === null
        ? {
            _tag: "OpenLiveItem",
            windowId: ctx.view.windowId,
            bookmarkId: folderId,
            itemId: item.id,
          }
        : { _tag: "ActivateTab", tabId: openTab.tabId },
    )

  const close = () => {
    if (openTab !== null) void ctx.run({ _tag: "CloseTab", tabId: openTab.tabId })
  }

  const closeOnMiddleClick = (event: MouseEvent) => {
    if (event.button !== 1 || openTab === null) return
    event.preventDefault()
    close()
  }

  const suppressAutoscroll = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault()
  }

  const scheduleTooltip = (event: PointerEvent) => {
    if (ctx.drag.source !== null) return
    ctx.tooltip.schedule(
      item.subtitle === "" ? { title: item.title } : { title: item.title, hint: item.subtitle },
      { x: event.clientX, y: event.clientY },
    )
  }
</script>

<li
  bind:this={row}
  class="item"
  class:unseen={item.isUnseen}
  class:open={openTab !== null}
  class:active={isActive}
  onauxclick={closeOnMiddleClick}
>
  <button
    class="main"
    type="button"
    aria-current={isActive ? "true" : undefined}
    onclick={activate}
    onmousedown={suppressAutoscroll}
    onpointerenter={scheduleTooltip}
    onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
    onpointerleave={() => ctx.tooltip.hide()}
    onpointerdown={() => ctx.tooltip.hide()}
  >
    {#if item.isUnseen}
      <span class="unseen-dot" aria-hidden="true"></span>
      <span class="visually-hidden">{t("sidepanel.liveFolder.unseen")}</span>
    {/if}
    <span class="favicon"><LiveItemIcon {item} /></span>
    <span class="text">
      <span class="title-line">
        {#if item.isImportant === true}
          <svg class="important" width="11" height="9" viewBox="0 0 11 9" aria-hidden="true">
            <path d="M1 1h6.2L10 4.5 7.2 8H1l2.4-3.5z" />
          </svg>
          <span class="visually-hidden">{t("sidepanel.liveFolder.important")}</span>
        {/if}
        <span class="title">{item.title}</span>
      </span>
      {#if item.subtitle !== ""}
        <span class="subtitle">{item.subtitle}</span>
      {/if}
    </span>
  </button>
  {#if openTab !== null}
    <button class="close" type="button" aria-label={t("actions.closeTab")} onclick={close}>
      <Icon name="close" size={13} />
    </button>
  {/if}
</li>

<style>
  .item {
    position: relative;
    border-radius: var(--radius-row);
    list-style: none;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .item:hover {
    background: var(--surface-hover);
  }

  .item.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
  }

  .main {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--row-height);
    padding: 3px 10px;
    border: none;
    border-radius: var(--radius-row);
    background: none;
    text-align: start;
  }

  .item.open .main {
    padding-right: 34px;
  }

  .close {
    position: absolute;
    top: 50%;
    right: 6px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    opacity: 0;
    transform: translateY(-50%);
    transition: opacity 100ms ease;
  }

  .item:hover .close,
  .close:focus-visible {
    opacity: 1;
  }

  .close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .unseen-dot {
    position: absolute;
    top: 50%;
    left: 1px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text);
    transform: translateY(-50%);
  }

  .favicon {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .important {
    flex: none;
    fill: #f2b200;
  }

  .title,
  .subtitle {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
  }

  .item.open .title {
    color: var(--text);
  }

  .item.unseen .title {
    color: var(--text);
    font-weight: 600;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }
</style>
