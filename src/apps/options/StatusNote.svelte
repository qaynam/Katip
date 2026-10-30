<script lang="ts" module>
  export interface Note {
    readonly text: string
    /** Done は済んだことを、Info は操作の結果を控えめに、Alert は失敗を知らせる。 */
    readonly tone: "Done" | "Info" | "Alert"
  }
</script>

<script lang="ts">
  let { note }: { note: Note | null } = $props()
</script>

<!-- 読み上げ領域は中身より先に DOM に置いておかないと、変化が読み上げられない -->
<div class="status" role="status">
  {#if note !== null}
    <p class="note" class:alert={note.tone === "Alert"}>
      {#if note.tone === "Done"}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.75 6.25l2.25 2.25 4.25-5" /></svg>
      {/if}
      {note.text}
    </p>
  {/if}
</div>

<style>
  .status {
    min-width: 0;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
    animation: appear 200ms ease-out;
  }

  .note.alert {
    color: var(--danger);
  }

  svg {
    flex: none;
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .note {
      animation: none;
    }
  }
</style>
