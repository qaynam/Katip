<script lang="ts">
  import { faviconCandidates, faviconLetter, type FaviconResolver } from "../logic/favicon"
  import type { ResultIcon } from "../logic/result-display"
  import CommandGlyph from "./CommandGlyph.svelte"
  import SearchGlyph from "./SearchGlyph.svelte"

  interface Props {
    icon: ResultIcon
    faviconUrl: FaviconResolver
  }

  const { icon, faviconUrl }: Props = $props()

  let failed = $state.raw<ReadonlySet<string>>(new Set())
  const candidates = $derived(
    icon._tag === "Favicon" ? faviconCandidates(icon.pageUrl, icon.favIconUrl, faviconUrl) : [],
  )
  const source = $derived(candidates.find((candidate) => !failed.has(candidate)))

  const skip = (candidate: string) => {
    failed = new Set([...failed, candidate])
  }
</script>

<span class="tile" aria-hidden="true">
  {#if icon._tag === "Swatch"}
    <span class="swatch" style:--swatch={icon.color}></span>
  {:else if icon._tag === "Search"}
    <SearchGlyph />
  {:else if icon._tag === "Glyph"}
    <CommandGlyph glyph={icon.glyph} />
  {:else if source === undefined}
    <span class="letter">{faviconLetter(icon.pageUrl, icon.title)}</span>
  {:else}
    <img
      class="favicon"
      src={source}
      alt=""
      width="16"
      height="16"
      draggable="false"
      onerror={() => skip(source)}
    />
  {/if}
</span>

<style>
  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--icon-tile);
    color: var(--text);
  }

  .favicon {
    display: block;
    border-radius: 3px;
  }

  .letter {
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.2);
  }
</style>
