<script lang="ts">
  import type { SpaceView } from "#protocol"
  import { getSidebarContext } from "../state/sidebar-context"
  import TemporaryTabRow from "./TemporaryTabRow.svelte"

  interface Props {
    space: SpaceView
  }

  const { space }: Props = $props()
  const ctx = getSidebarContext()

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

  const closeAll = () =>
    void ctx.run({ _tag: "CloseTemporaryTabs", windowId: ctx.view.windowId, spaceId: space.id })
</script>

<section
  class="temporary"
  class:drop-after={dropZone === "after"}
  aria-label="一時タブ"
  ondragover={onDragOver}
>
  <div class="divider">
    <span class="rule"></span>
    {#if space.temporaryTabs.length > 0}
      <button class="clear" type="button" onclick={closeAll}>すべて閉じる</button>
    {/if}
  </div>
  <ul class="tabs">
    {#each space.temporaryTabs as tab (tab.tabId)}
      <TemporaryTabRow {tab} />
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
    gap: 8px;
    height: 26px;
    margin: 0 4px 4px 10px;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--rule);
  }

  .clear {
    padding: 2px 6px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
  }

  .clear:hover {
    background: var(--space-bg-hover);
    color: var(--text);
  }

  .tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
  }
</style>
