<script lang="ts">
  import { Option } from "effect"
  import { presetPages, type ThemeColor } from "#modules/theme"
  import { themeSwatch } from "../../logic/space-themes"
  import Icon from "../Icon.svelte"

  interface Props {
    onPick: (colors: ReadonlyArray<ThemeColor>) => void
  }

  const { onPick }: Props = $props()

  const pageLabels = ["単色", "グラデーション"]

  let page = $state(0)
  const presets = $derived(presetPages[page] ?? [])
  const pageLabel = $derived(pageLabels[page] ?? "プリセット")
</script>

<div class="presets">
  <button
    class="arrow"
    type="button"
    aria-label="前のプリセット"
    disabled={page === 0}
    onclick={() => (page -= 1)}
  >
    <Icon name="chevronLeft" size={14} />
  </button>
  <div class="swatches" role="group" aria-label="{pageLabel}のプリセット">
    {#each presets as preset, index (index)}
      <button
        class="swatch"
        type="button"
        aria-label="{pageLabel} {index + 1}"
        style:background={Option.getOrUndefined(themeSwatch(preset))}
        onclick={() => onPick(preset)}
      ></button>
    {/each}
  </div>
  <button
    class="arrow"
    type="button"
    aria-label="次のプリセット"
    disabled={page === presetPages.length - 1}
    onclick={() => (page += 1)}
  >
    <Icon name="chevronRight" size={14} />
  </button>
</div>

<style>
  .presets {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .swatches {
    display: flex;
    flex: 1;
    justify-content: space-between;
    min-width: 0;
    padding: 0 2px;
  }

  .swatch {
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.25);
    transition: transform 120ms ease;
  }

  .swatch:hover {
    transform: scale(1.15);
  }

  .arrow {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: rgb(255 255 255 / 0.75);
  }

  .arrow:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.08);
    color: #fff;
  }

  .arrow:disabled {
    color: rgb(255 255 255 / 0.25);
  }
</style>
