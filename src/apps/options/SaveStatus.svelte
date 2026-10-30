<script lang="ts" module>
  export type SaveOutcome = "Saved" | "Failed"
</script>

<script lang="ts">
  let { outcome }: { outcome: SaveOutcome | null } = $props()
</script>

<!-- 読み上げ領域は中身より先に DOM に置いておかないと、変化が読み上げられない -->
<div class="status" role="status">
  {#if outcome === "Saved"}
    <p class="toast">保存しました</p>
  {:else if outcome === "Failed"}
    <p class="toast failed">保存できませんでした。少し待ってから、もう一度変更してください。</p>
  {/if}
</div>

<style>
  .status {
    position: fixed;
    inset: auto 16px 24px;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .toast {
    margin: 0;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--surface);
    font-size: 0.8125rem;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
    animation: rise 160ms ease-out;
  }

  .toast.failed {
    border-radius: 8px;
    background: var(--danger);
    color: #fff;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
