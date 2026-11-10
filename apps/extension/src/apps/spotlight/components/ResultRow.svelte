<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import type { SpotlightResult } from "#protocol"
  import type { FaviconResolver } from "../logic/favicon"
  import { displayOf } from "../logic/result-display"
  import ResultIcon from "./ResultIcon.svelte"

  interface Props {
    id: string
    result: SpotlightResult
    isSelected: boolean
    /** The time a history page's "days ago" counts from, in epoch milliseconds. */
    now: number
    translator: Translator
    /** Whether to show the kind at the right end. Hidden when every row is known to be one kind. */
    showsKind?: boolean
    /** Puts the detail on the title's line, after it, rather than on a line of its own. */
    detailBesideTitle?: boolean
    faviconUrl: FaviconResolver
    onchoose: () => void
    /** Called when the mouse points at the row, to move the selection to it. */
    onpoint: () => void
  }

  const {
    id,
    result,
    isSelected,
    now,
    translator,
    showsKind = true,
    detailBesideTitle = false,
    faviconUrl,
    onchoose,
    onpoint,
  }: Props = $props()
  const display = $derived(displayOf(result, now, translator))
</script>

<!-- The keyboard works from the input through aria-activedescendant, so pressing a row must not
     take focus from the input -->
<button
  {id}
  class="row"
  class:selected={isSelected}
  type="button"
  role="option"
  tabindex="-1"
  aria-selected={isSelected}
  onpointermove={onpoint}
  onmousedown={(event) => event.preventDefault()}
  onclick={onchoose}
>
  <ResultIcon icon={display.icon} {faviconUrl} />
  <span class="text" class:beside={detailBesideTitle}>
    <span class="title">{display.title}</span>
    {#if display.detail !== ""}
      <span class="detail">{display.detail}</span>
    {/if}
  </span>
  {#if showsKind}
    <span class="kind">{display.kindLabel}</span>
  {/if}
  {#if display.shortcut !== null}
    <kbd class="shortcut">{display.shortcut}</kbd>
  {/if}
</button>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--row-gap, 12px);
    width: 100%;
    min-height: var(--row-height, 48px);
    padding: var(--row-padding-block, 6px) 12px var(--row-padding-block, 6px) 10px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: default;
    user-select: none;
  }

  .row.selected {
    background: var(--selected-surface);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .text.beside {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  /* The title keeps its whole width first; the detail takes what is left, down to nothing */
  .text.beside .title {
    flex: 0 1 auto;
    min-width: 0;
  }

  .text.beside .detail {
    flex: 1 1 0;
    min-width: 0;
  }

  .title,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: var(--title-size, 14px);
    font-weight: 600;
  }

  .detail {
    color: var(--text-muted);
    font-size: var(--detail-size, 12px);
  }

  .kind {
    flex: none;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
  }

  .row.selected .kind {
    color: var(--text);
  }

  .shortcut {
    flex: none;
    padding: 1px 6px;
    border: 0.5px solid var(--divider);
    border-radius: 5px;
    color: var(--text-muted);
    font: inherit;
    font-size: 11.5px;
    letter-spacing: 0.04em;
  }

  .row.selected .shortcut {
    color: var(--text);
  }
</style>
