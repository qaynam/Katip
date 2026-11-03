<script lang="ts">
  import type { BookmarkId } from "#platform/browser"
  import type { LiveItemView } from "#protocol"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"

  interface Props {
    item: LiveItemView
    folderId: BookmarkId
  }

  const { item, folderId }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const open = () =>
    void ctx.run({
      _tag: "OpenLiveItem",
      windowId: ctx.view.windowId,
      bookmarkId: folderId,
      itemId: item.id,
    })

  const scheduleTooltip = (event: PointerEvent) => {
    if (ctx.drag.source !== null) return
    ctx.tooltip.schedule(
      item.subtitle === "" ? { title: item.title } : { title: item.title, hint: item.subtitle },
      { x: event.clientX, y: event.clientY },
    )
  }
</script>

<li class="item" class:unseen={item.isUnseen}>
  <button
    class="main"
    type="button"
    onclick={open}
    onpointerenter={scheduleTooltip}
    onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
    onpointerleave={() => ctx.tooltip.hide()}
    onpointerdown={() => ctx.tooltip.hide()}
  >
    {#if item.isUnseen}
      <span class="unseen-dot" aria-hidden="true"></span>
      <span class="visually-hidden">{t("sidepanel.liveFolder.unseen")}</span>
    {/if}
    <span class="favicon"><Favicon pageUrl={item.url} favIconUrl={null} title={item.title} /></span>
    <span class="text">
      <span class="title">{item.title}</span>
      {#if item.subtitle !== ""}
        <span class="subtitle">{item.subtitle}</span>
      {/if}
    </span>
  </button>
</li>

<style>
  .item {
    list-style: none;
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
    transition: background-color 120ms ease;
  }

  .main:hover {
    background: var(--surface-hover);
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
