<script lang="ts">
  import { keysOfShortcut } from "./shortcut-keys"

  let {
    id,
    shortcut,
    notSetLabel,
  }: {
    id: string
    /** As the browser reports it, such as "⇧⌘C". `null` when no key is assigned. */
    shortcut: string | null
    notSetLabel: string
  } = $props()

  const split = $derived(shortcut === null ? null : keysOfShortcut(shortcut))
</script>

<!-- No whitespace between the tags: it would make the keys read differently from the shortcut the
     browser reports -->
{#if split === null}
  <span {id} class="not-set">{notSetLabel}</span>
{:else}
  <kbd {id} class="keys"
    >{#each split.keys as key, index (index)}{#if index > 0 && split.separator !== ""}<span
          class="separator">{split.separator}</span
        >{/if}<kbd class="cap">{key}</kbd>{/each}</kbd
  >
{/if}

<style>
  .keys {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font: inherit;
  }

  .cap {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border: 0.5px solid var(--control-edge);
    border-radius: 6px;
    background: var(--control-face);
    box-shadow: var(--control-depth);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .separator {
    color: var(--text-muted);
    font-size: 11px;
  }

  .not-set {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    height: 22px;
    padding: 0 8px;
    border: 1px dashed var(--divider);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
  }
</style>
