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
  <div class="group">
    {@render children()}
  </div>
  {#if footnote !== undefined}
    <p class="footnote">{footnote}</p>
  {/if}
</section>

<style>
  h2 {
    margin: 0 0 7px 12px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .group {
    border: 1px solid var(--group-edge);
    border-radius: 10px;
    background: var(--group);
  }

  .group > :global(*) {
    position: relative;
  }

  .group > :global(*:not(:first-child))::before {
    content: "";
    position: absolute;
    top: 0;
    inset-inline: 12px;
    border-top: 1px solid var(--separator);
  }

  .footnote {
    margin: 7px 12px 0;
    color: var(--secondary-label);
    font-size: 11.5px;
    line-height: 1.5;
    text-wrap: pretty;
  }
</style>
