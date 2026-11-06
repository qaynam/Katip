<script lang="ts">
  import { untrack } from "svelte"

  interface Props {
    background: string
    /** Fades from the previous background only when this changes; otherwise repaints at once. */
    transitionKey: string
    /** A CSS `url()` of the texture's tile. */
    grainImage: string
    grainTileSize: string
    grainOpacity: number
  }

  const { background, transitionKey, grainImage, grainTileSize, grainOpacity }: Props = $props()

  interface Layer {
    readonly id: number
    readonly key: string
    readonly background: string
  }

  // CSS can't interpolate between gradient backgrounds, so the new background fades in as a
  // layer on top, and the layers below are dropped once it fully covers them
  let nextLayerId = 1
  let layers = $state.raw<ReadonlyArray<Layer>>(
    untrack(() => [{ id: 0, key: transitionKey, background }]),
  )

  $effect.pre(() => {
    const next = { key: transitionKey, background }
    untrack(() => {
      const top = layers.at(-1)
      if (top?.key === next.key) {
        if (top.background !== next.background) {
          layers = [...layers.slice(0, -1), { ...top, background: next.background }]
        }
        return
      }
      layers = [...layers.slice(-1), { id: nextLayerId++, ...next }]
    })
  })

  const dropLayersBelow = (id: number) => {
    layers = layers.filter((layer) => layer.id >= id)
  }
</script>

<div class="backdrop" aria-hidden="true">
  {#each layers as layer, index (layer.id)}
    <div
      class="layer"
      class:entering={index > 0}
      data-backdrop-layer
      style:--layer-background={layer.background}
      onanimationend={() => dropLayersBelow(layer.id)}
    ></div>
  {/each}
  <div
    class="grain"
    style:background-image={grainImage}
    style:background-size={grainTileSize}
    style:opacity={grainOpacity}
  ></div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .layer {
    position: absolute;
    inset: 0;
    background: var(--layer-background);
  }

  .layer.entering {
    animation: layer-in 320ms ease-out;
  }

  /* The overlay blend mode barely changes near-white backgrounds, so the grain vanishes on
     neutral light themes. Black and white grains with normal blending stay about as visible on
     any background */
  .grain {
    position: absolute;
    inset: 0;
    transition: opacity 200ms ease;
  }

  @keyframes layer-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .layer.entering {
      animation-duration: 1ms;
    }
  }
</style>
