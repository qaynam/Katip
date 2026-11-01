<script lang="ts">
  import type { SpaceView } from "#protocol"
  import { getSidebarContext } from "../state/sidebar-context"
  import PinnedNodes from "./PinnedNodes.svelte"

  interface Props {
    pinned: SpaceView["pinned"]
    onReload: () => void
  }

  const { pinned, onReload }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const sectionKey = "pinned-section"
  const dropZone = $derived(ctx.drag.zoneFor(sectionKey))

  const onDragOver = (event: DragEvent) => {
    if (pinned._tag === "Unavailable") {
      ctx.drag.reject()
      return
    }
    const isEmpty = pinned.nodes.length === 0
    if (!isEmpty && event.target !== event.currentTarget) {
      ctx.drag.keep(event)
      return
    }
    ctx.drag.offer(event, sectionKey, isEmpty ? "into" : "after", {
      _tag: "Pinned",
      parentId: null,
      slot: pinned.nodes.length,
    })
  }
</script>

<section
  class="pinned"
  class:drop-after={dropZone === "after"}
  aria-label={t("sidepanel.pinned.region")}
  ondragover={onDragOver}
>
  {#if pinned._tag === "Unavailable"}
    <div class="unavailable" role="status">
      <p>{t("sidepanel.pinned.unavailable")}</p>
      <button type="button" onclick={onReload}>{t("sidepanel.pinned.reload")}</button>
    </div>
  {:else if pinned.nodes.length === 0}
    <p class="empty" class:drop-into={dropZone === "into"}>{t("sidepanel.pinned.empty")}</p>
  {:else}
    <PinnedNodes nodes={pinned.nodes} parentId={null} />
  {/if}
</section>

<style>
  .pinned {
    position: relative;
    padding-bottom: 4px;
  }

  .pinned.drop-after::after {
    position: absolute;
    right: 8px;
    bottom: 1px;
    left: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
  }

  .empty {
    display: grid;
    place-items: center;
    height: var(--row-height);
    margin: 0;
    padding: 0 12px;
    border-radius: var(--radius-row);
    color: var(--text-muted);
    font-size: 12px;
    transition: background-color 120ms ease;
  }

  .empty.drop-into {
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1.5px var(--drop-line);
  }

  .unavailable {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    border-radius: var(--radius-row);
    background: var(--surface-raised);
    font-size: 12px;
  }

  .unavailable p {
    margin: 0;
  }

  .unavailable button {
    height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 7px;
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    font-weight: 600;
  }
</style>
