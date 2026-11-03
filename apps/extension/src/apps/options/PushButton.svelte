<script lang="ts">
  import type { Snippet } from "svelte"
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    onclick,
    disabled = false,
    children,
    ...attributes
  }: Partial<RowControlAttributes> & {
    onclick: () => void
    disabled?: boolean
    children: Snippet
  } = $props()
</script>

<button {...attributes} type="button" {disabled} {onclick}>{@render children()}</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border: 0.5px solid var(--control-edge);
    border-radius: 8px;
    background: var(--control-face);
    box-shadow: var(--control-depth);
    white-space: nowrap;
    transition: opacity 120ms ease;
  }

  button:active {
    opacity: 0.7;
  }

  button:disabled {
    color: var(--text-muted);
    opacity: 0.6;
  }
</style>
