<script lang="ts">
  import { SpaceColor } from "#modules/space"
  import { spaceColorLabel } from "../logic/space-colors"
  import Icon from "./Icon.svelte"

  interface Props {
    label: string
    selected: SpaceColor
    onPick: (color: SpaceColor) => void
    /** メニューの中では menuitemradio として振る舞わせる */
    itemRole?: "radio" | "menuitemradio"
  }

  const { label, selected, onPick, itemRole = "radio" }: Props = $props()
</script>

<div class="swatches" role={itemRole === "radio" ? "radiogroup" : "group"} aria-label={label}>
  {#each SpaceColor.literals as color (color)}
    <button
      class="swatch"
      type="button"
      role={itemRole}
      aria-checked={color === selected}
      aria-label={spaceColorLabel[color]}
      title={spaceColorLabel[color]}
      data-space-color={color}
      onclick={() => onPick(color)}
    >
      {#if color === selected}
        <Icon name="check" size={12} />
      {/if}
    </button>
  {/each}
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(9, 22px);
    justify-content: space-between;
    gap: 4px;
  }

  .swatch {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--space-swatch);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    color: #fff;
    transition: transform 100ms ease;
  }

  .swatch:hover {
    transform: scale(1.12);
  }

  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 2px var(--menu-bg, #fff),
      0 0 0 3.5px var(--space-swatch);
  }
</style>
