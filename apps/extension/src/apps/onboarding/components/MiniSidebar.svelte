<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    rows = 5,
    tint = "#dbe6fb",
    children,
  }: {
    /** How many tab rows to draw under whatever `children` adds at the top. */
    rows?: number
    tint?: string
    children?: Snippet
  } = $props()
</script>

<div class="sidebar" style:--tint={tint}>
  {@render children?.()}
  {#each { length: rows }, index (index)}
    <div class="row">
      <span class="icon"></span>
      <span class="line" style:width="{70 - ((index * 13) % 30)}%"></span>
    </div>
  {/each}
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 5px;
    height: 100%;
    padding: 10px 8px;
    box-sizing: border-box;
    background: var(--tint);
    transition: background 400ms ease;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 16px;
    padding: 0 5px;
    border-radius: 5px;
  }

  .icon {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 28%, transparent);
  }

  .line {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink) 22%, transparent);
  }
</style>
