<script lang="ts">
  import type { SpaceView, TemporaryEntry } from "#protocol"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import TemporarySplitRow from "./TemporarySplitRow.svelte"
  import TemporaryTabRow from "./TemporaryTabRow.svelte"

  interface Props {
    space: SpaceView
  }

  const { space }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const sectionKey = "temporary-section"
  const dropZone = $derived(ctx.drag.zoneFor(sectionKey))

  const onDragOver = (event: DragEvent) => {
    if (event.target !== event.currentTarget) {
      ctx.drag.keep(event)
      return
    }
    ctx.drag.offer(event, sectionKey, "after", {
      _tag: "Temporary",
      placement: { _tag: "Bottom" },
    })
  }

  const entryKey = (entry: TemporaryEntry) =>
    entry._tag === "TemporaryTab" ? `tab:${entry.tab.tabId}` : `split:${entry.splitViewId}`

  const clear = () =>
    void ctx.run({ _tag: "CloseTemporaryTabs", windowId: ctx.view.windowId, spaceId: space.id })
</script>

<section
  class="temporary"
  class:drop-after={dropZone === "after"}
  aria-label={t("sidepanel.temporary.region")}
  ondragover={onDragOver}
>
  <div class="divider">
    <span class="rule"></span>
    {#if space.temporaryEntries.length > 0}
      <button class="clear" type="button" title={t("actions.closeTemporaryTabs")} onclick={clear}>
        <Icon name="arrowDown" size={11} />
        <span>{t("sidepanel.temporary.clear")}</span>
      </button>
    {/if}
  </div>
  <button
    class="new-tab"
    type="button"
    onclick={() => void ctx.run({ _tag: "OpenNewTab", windowId: ctx.view.windowId })}
  >
    <span class="plus"><Icon name="plus" size={15} /></span>
    <span>{t("common.newTab")}</span>
  </button>
  <ul class="tabs">
    {#each space.temporaryEntries as entry (entryKey(entry))}
      {#if entry._tag === "TemporaryTab"}
        <TemporaryTabRow tab={entry.tab} />
      {:else}
        <TemporarySplitRow splitViewId={entry.splitViewId} tabs={entry.tabs} />
      {/if}
    {/each}
  </ul>
</section>

<style>
  .temporary {
    position: relative;
    flex: 1;
    min-height: 48px;
    padding-bottom: 12px;
  }

  .temporary.drop-after::after {
    position: absolute;
    right: 8px;
    bottom: 6px;
    left: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    margin: 2px 0 2px 10px;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--divider);
  }

  .clear {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 20px;
    padding: 0 4px;
    border: none;
    border-radius: 5px;
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    opacity: 0;
    transition: opacity 140ms ease;
  }

  :global(.sidebar:hover) .clear,
  .clear:focus-visible {
    opacity: 1;
  }

  .clear:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .new-tab {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: var(--row-height);
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-row);
    background: none;
    color: var(--text-muted);
    font-size: 14px;
    text-align: start;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .new-tab:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .plus {
    display: grid;
    place-items: center;
    width: 16px;
  }

  .tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
  }
</style>
