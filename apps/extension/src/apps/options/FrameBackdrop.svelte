<script lang="ts">
  import type { ThemeAppearance } from "#modules/theme"

  let {
    appearance,
  }: {
    appearance: Pick<
      ThemeAppearance,
      "background" | "grainImage" | "grainTileSize" | "grainOpacity"
    >
  } = $props()
</script>

<div class="backdrop" aria-hidden="true" style:--backdrop-background={appearance.background}>
  <div
    class="grain"
    style:background-image={appearance.grainImage}
    style:background-size={appearance.grainTileSize}
    style:opacity={appearance.grainOpacity}
  ></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: var(--backdrop-background);
    pointer-events: none;
  }

  .grain {
    position: absolute;
    inset: 0;
  }
</style>
