<script lang="ts">
  import type { Snippet } from "svelte"
  import type { RowControlAttributes } from "./SettingRow.svelte"

  let {
    onclick,
    children,
    ...control
  }: RowControlAttributes & {
    onclick: () => void
    children: Snippet
  } = $props()
</script>

<button {...control} type="button" {onclick}>{@render children()}</button>

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
</style>
