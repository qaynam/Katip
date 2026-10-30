<script lang="ts">
  import { untrack } from "svelte"

  interface Props {
    background: string
    /** この値が変わったときだけ前の背景からフェードする。同じ値の間は即座に塗り替える */
    transitionKey: string
    grainOpacity: number
  }

  const { background, transitionKey, grainOpacity }: Props = $props()

  interface Layer {
    readonly id: number
    readonly key: string
    readonly background: string
  }

  // CSS はグラデーション同士の背景を補間できない。新しい背景の層を上に重ねてフェードインさせ、
  // 覆い終わったら下の層を捨てる
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
  <div class="grain" style:opacity={grainOpacity}></div>
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

  /* overlay で重ねると白に近い背景ではほとんど変化せず、無彩色のライトテーマで粒が消える。
     黒と白の粒を通常の合成で重ね、背景の明るさによらず同じくらい見えるようにする */
  .grain {
    position: absolute;
    inset: 0;
    background-image: var(--grain-image);
    background-size: 200px 200px;
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
