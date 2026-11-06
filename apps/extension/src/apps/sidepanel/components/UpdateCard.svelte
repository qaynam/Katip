<script lang="ts">
  import type { Release } from "#modules/updates"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  interface Props {
    release: Release
    onOpen: () => void
    onDismiss: () => void
  }

  const { release, onOpen, onDismiss }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const id = $props.id()
  const titleId = `${id}-title`
</script>

<section class="card glass" aria-labelledby={titleId}>
  <header class="header">
    <h2 id={titleId} class="title">
      {t("sidepanel.update.available", { version: release.version })}
    </h2>
    <button
      class="dismiss"
      type="button"
      aria-label={t("sidepanel.update.dismiss")}
      onclick={onDismiss}
    >
      <Icon name="close" size={12} />
    </button>
  </header>
  <button class="action" type="button" onclick={onOpen}>
    <Icon name="sparkles" size={14} />
    {t("sidepanel.update.whatsNew")}
  </button>
</section>

<style>
  .card {
    margin: 0 8px 8px;
    overflow: hidden;
    border-radius: 12px;
    font-size: 12px;
    animation: card-in 200ms ease-out;
  }

  .header {
    position: relative;
    padding: 8px 30px;
    border-bottom: 0.5px solid var(--glass-border);
  }

  .title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .dismiss {
    position: absolute;
    top: 50%;
    right: 6px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: none;
    opacity: 0.6;
    transform: translateY(-50%);
  }

  .dismiss:hover {
    background: var(--glass-hover);
    opacity: 1;
  }

  .action {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 12px;
    border: none;
    background: none;
    font-size: 12px;
    text-align: start;
  }

  .action:hover {
    background: var(--glass-hover);
  }

  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
</style>
