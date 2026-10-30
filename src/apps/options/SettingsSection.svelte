<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    heading,
    footnote,
    children,
  }: {
    heading?: string
    footnote?: string
    children: Snippet
  } = $props()

  const id = $props.id()
  const headingId = `${id}-heading`
</script>

<section aria-labelledby={heading === undefined ? undefined : headingId}>
  {#if heading !== undefined}
    <h2 id={headingId}>{heading}</h2>
  {/if}
  <div class="rows">
    {@render children()}
  </div>
  {#if footnote !== undefined}
    <p class="footnote">{footnote}</p>
  {/if}
</section>

<style>
  h2 {
    display: flex;
    align-items: center;
    height: 28px;
    margin: 0;
    padding: 0 12px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.005em;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .footnote {
    margin: 6px 12px 0;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 400;
    line-height: 1.5;
    text-wrap: pretty;
  }
</style>
