<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  const ctx = getSidebarContext()
  const label = $derived(ctx.translator.t("sidepanel.close"))
</script>

<button
  class="close-panel"
  type="button"
  aria-label={label}
  onclick={() => ctx.sidePanel.close(ctx.view.windowId)}
  onpointerenter={(event) =>
    ctx.tooltip.schedule({ title: label }, { x: event.clientX, y: event.clientY })}
  onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
  onpointerleave={() => ctx.tooltip.hide()}
  onpointerdown={() => ctx.tooltip.hide()}
>
  <Icon name="sidebar" size={20} />
</button>

<style>
  .close-panel {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text);
    opacity: 0.75;
    transition:
      background-color 120ms ease,
      opacity 120ms ease;
  }

  .close-panel:hover {
    background: var(--surface-hover);
    opacity: 1;
  }
</style>
