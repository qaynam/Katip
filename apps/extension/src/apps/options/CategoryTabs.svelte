<script lang="ts">
  import { CATEGORIES, type Category, categoryLooks } from "./categories"
  import Glyph from "./Glyph.svelte"

  let {
    selected,
    labelOf,
    labelledBy,
    tabIdOf,
    panelId,
    onselect,
  }: {
    selected: Category
    labelOf: (category: Category) => string
    /** Id of the heading that names the whole list of categories. */
    labelledBy: string
    tabIdOf: (category: Category) => string
    panelId: string
    onselect: (category: Category) => void
  } = $props()

  const tabs: Partial<Record<Category, HTMLButtonElement>> = {}

  const stepKeys: Readonly<Record<string, (index: number) => number>> = {
    ArrowDown: (index) => (index + 1) % CATEGORIES.length,
    ArrowRight: (index) => (index + 1) % CATEGORIES.length,
    ArrowUp: (index) => (index - 1 + CATEGORIES.length) % CATEGORIES.length,
    ArrowLeft: (index) => (index - 1 + CATEGORIES.length) % CATEGORIES.length,
    Home: () => 0,
    End: () => CATEGORIES.length - 1,
  }

  // The list stacks vertically beside the page but wraps into rows on narrow windows, so both arrow
  // axes move between categories instead of only the one that matches the current layout
  const moveSelection = (event: KeyboardEvent) => {
    const step = stepKeys[event.key]
    if (step === undefined) return
    const next = CATEGORIES[step(CATEGORIES.indexOf(selected))]
    if (next === undefined) return
    event.preventDefault()
    onselect(next)
    tabs[next]?.focus()
  }
</script>

<div class="tablist" role="tablist" aria-labelledby={labelledBy} aria-orientation="vertical">
  {#each CATEGORIES as category (category)}
    {@const isSelected = category === selected}
    <button
      bind:this={tabs[category]}
      id={tabIdOf(category)}
      class="tab"
      type="button"
      role="tab"
      aria-selected={isSelected}
      aria-controls={isSelected ? panelId : undefined}
      tabindex={isSelected ? 0 : -1}
      onclick={() => onselect(category)}
      onkeydown={moveSelection}
    >
      <span class="glyph-slot"><Glyph name={categoryLooks[category].icon} /></span>
      <span class="label">{labelOf(category)}</span>
    </button>
  {/each}
</div>

<style>
  .tablist {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: var(--row-height);
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-row);
    background: none;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.003em;
    text-align: start;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .tab:hover {
    background: var(--surface-hover);
  }

  .tab[aria-selected="true"] {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
  }

  .tab:focus-visible {
    outline-offset: -2px;
  }

  .glyph-slot {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    color: var(--text-muted);
    transition: color 120ms ease;
  }

  .tab[aria-selected="true"] .glyph-slot {
    color: var(--accent);
  }

  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .tablist {
      flex-flow: row wrap;
      gap: 4px;
    }

    .tab {
      gap: 7px;
      height: 32px;
      padding: 0 11px 0 9px;
      font-size: 13px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tab,
    .glyph-slot {
      transition: none;
    }
  }
</style>
