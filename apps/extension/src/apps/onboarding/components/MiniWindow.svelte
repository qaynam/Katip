<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    toolbar,
    children,
  }: {
    /** Drawn at the right end of the toolbar, where extension icons sit. */
    toolbar?: Snippet
    children: Snippet
  } = $props()
</script>

<div class="window">
  <div class="toolbar">
    <span class="lights"><i></i><i></i><i></i></span>
    <span class="address"></span>
    {@render toolbar?.()}
  </div>
  <div class="content">{@render children()}</div>
</div>

<style>
  .window {
    display: flex;
    flex-direction: column;
    width: 82%;
    height: 80%;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--window-shadow);
  }

  .toolbar {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    height: 26px;
    padding: 0 10px;
    border-bottom: 1px solid var(--hairline);
  }

  .lights {
    display: flex;
    gap: 4px;
  }

  .lights i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
  }

  .address {
    flex: 1;
    max-width: 50%;
    height: 12px;
    margin-inline: auto;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }

  .content {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  }
</style>
