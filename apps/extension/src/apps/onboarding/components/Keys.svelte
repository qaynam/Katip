<script lang="ts">
  import { keysOfShortcut } from "#platform/keyboard-shortcuts"

  let { shortcut, large = false }: { shortcut: string; large?: boolean } = $props()

  const split = $derived(keysOfShortcut(shortcut))
</script>

<!-- No whitespace between the tags: it would make the keys read differently from the shortcut the
     browser reports -->
<kbd class="keys" class:large
  >{#each split.keys as key, index (index)}{#if index > 0 && split.separator !== ""}<span
        class="separator">{split.separator}</span
      >{/if}<kbd class="cap" style:--index={index}>{key}</kbd>{/each}</kbd
>

<style>
  .keys {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: inherit;
  }

  .cap {
    display: inline-grid;
    place-items: center;
    min-width: 1.9em;
    height: 1.9em;
    padding: 0 0.45em;
    box-sizing: border-box;
    border-radius: 0.45em;
    background: var(--surface);
    box-shadow:
      0 0 0 1px var(--hairline),
      0 1.5px 0 var(--hairline);
    color: var(--ink);
    font: inherit;
    font-size: 0.875em;
    font-weight: 500;
  }

  .large {
    font-size: 1.75rem;
  }

  .separator {
    color: var(--ink-secondary);
    font-size: 0.8em;
  }
</style>
