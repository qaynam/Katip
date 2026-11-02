<script lang="ts">
  import { untrack } from "svelte"

  let {
    background,
    transitionKey,
    grainOpacity,
  }: {
    background: string
    /** Fades from the previous background only when this changes; same-key changes repaint at once. */
    transitionKey: string
    grainOpacity: number
  } = $props()

  interface Layer {
    readonly id: number
    readonly key: string
    readonly background: string
  }

  // CSS can't interpolate between two gradient backgrounds. Lay the new background on top, fade it
  // in, and drop the layers below once it covers them
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
      style:--layer-background={layer.background}
      onanimationend={() => dropLayersBelow(layer.id)}
    ></div>
  {/each}
  <div class="grain" style:opacity={grainOpacity}></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }

  .layer {
    position: absolute;
    inset: 0;
    background: var(--layer-background);
  }

  .layer.entering {
    animation: layer-in 360ms ease-out;
  }

  .grain {
    position: absolute;
    inset: 0;
    background-image: var(--grain-image);
    background-size: 200px 200px;
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
