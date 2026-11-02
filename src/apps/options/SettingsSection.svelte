<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    heading,
    footnote,
    listsTerms = false,
    children,
  }: {
    heading?: string
    footnote?: string
    /** Wraps the rows in a description list, for rows that pair a term with its value. */
    listsTerms?: boolean
    children: Snippet
  } = $props()

  const id = $props.id()
  const headingId = `${id}-heading`
</script>

<section aria-labelledby={heading === undefined ? undefined : headingId}>
  {#if heading !== undefined}
    <h3 id={headingId}>{heading}</h3>
  {/if}
  <svelte:element this={listsTerms ? "dl" : "div"} class="rows">
    {@render children()}
  </svelte:element>
  {#if footnote !== undefined}
    <p class="footnote">{footnote}</p>
  {/if}
</section>

<style>
  h3 {
    margin: 0 0 2px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.005em;
  }

  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
  }

  .footnote {
    max-width: 60ch;
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.55;
    text-wrap: pretty;
  }
</style>
