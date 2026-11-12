<script lang="ts">
  import {
    SPOTLIGHT_LAYOUTS,
    SPOTLIGHT_ROW_HEIGHT,
    SPOTLIGHT_SEARCH_HEIGHT,
    type SpotlightSize,
  } from "#modules/spotlight"
  import { TITLE_BAR_HEIGHT } from "./spotlight-position"

  let { size }: { size: SpotlightSize } = $props()

  const HINTS_HEIGHT = 30
  const TITLE_WIDTHS = [46, 34, 52, 40, 30, 44, 37]

  const layout = $derived(SPOTLIGHT_LAYOUTS[size])
  const shownHeight = $derived(
    layout.collapses ? TITLE_BAR_HEIGHT + SPOTLIGHT_SEARCH_HEIGHT : layout.window.height,
  )
  const rowCount = $derived(
    layout.collapses
      ? 0
      : Math.floor(
          (layout.window.height - TITLE_BAR_HEIGHT - SPOTLIGHT_SEARCH_HEIGHT - HINTS_HEIGHT) /
            SPOTLIGHT_ROW_HEIGHT,
        ),
  )
  const heightOf = (pixels: number) => `${(pixels / shownHeight) * 100}%`
</script>

<span class="shape" aria-hidden="true">
  <span class="title-bar" style:height={heightOf(TITLE_BAR_HEIGHT)}></span>
  <span class="search" style:height={heightOf(SPOTLIGHT_SEARCH_HEIGHT)}><i></i><b></b></span>
  {#each { length: rowCount }, index (index)}
    <span class="row" class:selected={index === 0} style:height={heightOf(SPOTLIGHT_ROW_HEIGHT)}>
      <i></i><b style:width="{TITLE_WIDTHS[index % TITLE_WIDTHS.length]}%"></b>
    </span>
  {/each}
</span>

<style>
  .shape {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: inherit;
    container-type: size;
    pointer-events: none;
  }

  .title-bar {
    flex: none;
    background: color-mix(in srgb, currentColor 6%, transparent);
  }

  .search,
  .row {
    display: flex;
    flex: none;
    align-items: center;
  }

  .search {
    gap: 2.4cqw;
    margin-bottom: 1cqw;
    padding: 0 3.6cqw;
    border-bottom: 0.5px solid color-mix(in srgb, currentColor 14%, transparent);
  }

  .search i {
    flex: none;
    box-sizing: border-box;
    height: 32%;
    aspect-ratio: 1;
    border: max(1px, 0.4cqw) solid color-mix(in srgb, currentColor 45%, transparent);
    border-radius: 50%;
  }

  .search b {
    width: 34%;
    height: max(1px, 16%);
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 22%, transparent);
  }

  .row {
    gap: 2.2cqw;
    margin: 0 1.2cqw;
    padding: 0 2.4cqw;
    border-radius: 1.2cqw;
  }

  .row.selected {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .row i {
    flex: none;
    height: 50%;
    aspect-ratio: 1;
    border-radius: 22%;
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .row b {
    height: max(1px, 14%);
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 30%, transparent);
  }
</style>
