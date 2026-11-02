<script lang="ts" module>
  export interface Note {
    readonly text: string
    /** Done reports something finished, Info quietly reports how an action went, Alert a failure. */
    readonly tone: "Done" | "Info" | "Alert"
  }
</script>

<script lang="ts">
  let { note }: { note: Note | null } = $props()
</script>

<!-- The live region has to be in the DOM before its content, or the change isn't announced -->
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
    align-items: flex-start;
    gap: 6px;
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 8px 12px;
    border: 0.5px solid var(--glass-border);
    border-radius: 11px;
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow);
    color: var(--glass-text);
    font-size: 12px;
    line-height: 1.45;
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
    animation: appear 180ms ease-out;
  }

  .note.alert {
    color: var(--danger);
  }

  svg {
    flex: none;
    width: 12px;
    height: 12px;
    margin-top: 2px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .note {
      animation: none;
    }
  }
</style>
