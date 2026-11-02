<script lang="ts">
  let { background, grainOpacity }: { background: string; grainOpacity: number } = $props()
</script>

<div class="backdrop" aria-hidden="true" style:--backdrop-background={background}>
  <div class="grain" style:opacity={grainOpacity}></div>
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
    background-image: var(--grain-image);
    background-size: 200px 200px;
  }
</style>
