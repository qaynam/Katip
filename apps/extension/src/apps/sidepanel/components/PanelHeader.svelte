<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  interface Props {
    headingId: string
    title: string
    closeLabel: string
  }

  const { headingId, title, closeLabel }: Props = $props()
  const ctx = getSidebarContext()
</script>

<header class="panel-header">
  <h2 id={headingId} class="heading">{title}</h2>
  <button
    class="close"
    type="button"
    aria-label={closeLabel}
    title={closeLabel}
    onclick={() => ctx.bodyPanel.close()}
  >
    <Icon name="close" size={14} />
  </button>
</header>

<style>
  .panel-header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 2px 0 10px;
  }

  .heading {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 700;
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
    color: var(--text-muted);
  }

  .close:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
