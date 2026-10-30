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
    margin: 0;
    padding: 3px 11px;
    border: 0;
    border-radius: 6px;
    background: var(--control);
    box-shadow:
      0 0 0 0.5px var(--control-edge),
      var(--control-shadow);
    line-height: 16px;
    white-space: nowrap;
  }

  button:active {
    background: var(--control-pressed);
  }

  button:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 1px;
  }
</style>
