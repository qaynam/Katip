<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"

  const ctx = getSidebarContext()
  const ids = $props.id()
  const request = $derived(ctx.dialog.current)

  // 破壊的な操作の確認なので、Enter の押し間違いで実行されないよう取消側にフォーカスを置く
  const focus = (button: HTMLButtonElement) => button.focus()

  const cancelOnEscape = (event: KeyboardEvent) => {
    if (request === null || event.key !== "Escape") return
    event.preventDefault()
    ctx.dialog.settle(false)
  }
</script>

<svelte:window onkeydown={cancelOnEscape} />

{#if request !== null}
  <div class="scrim">
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="{ids}-title"
      aria-describedby="{ids}-message"
    >
      <h2 id="{ids}-title" class="title">{request.title}</h2>
      <p id="{ids}-message" class="message">{request.message}</p>
      <div class="actions">
        <button
          class="cancel"
          type="button"
          onclick={() => ctx.dialog.settle(false)}
          {@attach focus}
        >
          キャンセル
        </button>
        <button class="confirm" type="button" onclick={() => ctx.dialog.settle(true)}>
          {request.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.28);
    animation: fade-in 120ms ease-out;
  }

  .dialog {
    width: 100%;
    max-width: 300px;
    padding: 18px 18px 14px;
    border-radius: 14px;
    background: var(--menu-bg);
    box-shadow: var(--menu-shadow);
    color: var(--menu-text);
  }

  .title {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 700;
  }

  .message {
    margin: 0 0 16px;
    color: var(--text-muted-on-menu);
    font-size: 12.5px;
    line-height: 1.55;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .actions button {
    height: 30px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
  }

  .cancel {
    background: var(--menu-hover);
    color: inherit;
  }

  .confirm {
    background: var(--danger-strong);
    color: #fff;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrim {
      animation: none;
    }
  }
</style>
