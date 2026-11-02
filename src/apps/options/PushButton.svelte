<script lang="ts">
  import type { Snippet } from "svelte"
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    onclick,
    disabled = false,
    children,
    ...control
  }: RowControlAttributes & {
    onclick: () => void
    disabled?: boolean
    children: Snippet
  } = $props()
</script>

<button {...control} type="button" {disabled} {onclick}>{@render children()}</button>

<style>
  button {
    height: 26px;
    padding: 0 11px;
    border: none;
    border-radius: 7px;
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
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
