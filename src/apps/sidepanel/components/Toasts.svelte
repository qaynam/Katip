<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import type { ToastQueue } from "../state/toast-queue.svelte"
  import Icon from "./Icon.svelte"

  interface Props {
    toasts: ToastQueue
    translator: Translator
  }

  const { toasts, translator }: Props = $props()
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast glass" class:error={toast.tone === "error"}>
      <span class="message">{toast.message}</span>
      <button
        class="dismiss"
        type="button"
        aria-label={translator.t("sidepanel.toast.dismiss")}
        onclick={() => toasts.dismiss(toast.id)}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    right: 8px;
    bottom: 100%;
    left: 8px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 6px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 8px 9px 12px;
    border-radius: 11px;
    font-size: 12px;
    line-height: 1.45;
    pointer-events: auto;
    animation: toast-in 160ms ease-out;
  }

  .toast.error {
    color: var(--danger);
  }

  .message {
    flex: 1;
  }

  .dismiss {
    display: grid;
    flex: none;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    opacity: 0.6;
  }

  .dismiss:hover {
    background: var(--glass-hover);
    opacity: 1;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
