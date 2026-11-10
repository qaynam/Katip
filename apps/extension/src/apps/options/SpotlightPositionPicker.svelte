<script lang="ts">
  import {
    SPOTLIGHT_LAYOUTS,
    SPOTLIGHT_SEARCH_HEIGHT,
    type SpotlightPosition,
    type SpotlightSize,
  } from "#modules/spotlight"
  import { draggedPosition, nudgedPosition } from "./spotlight-position"

  let {
    label,
    instructions,
    valueText,
    size,
    value,
    onchange,
  }: {
    label: string
    instructions: string
    /** Says where Spotlight is, for screen readers, as percentages across and down. */
    valueText: (across: number, down: number) => string
    size: SpotlightSize
    value: SpotlightPosition
    onchange: (position: SpotlightPosition) => void
  } = $props()

  const id = $props.id()
  const labelId = `${id}-label`
  const instructionsId = `${id}-instructions`

  // The browser window the picture stands for, so Spotlight is drawn to scale over it
  const SCREEN = { width: 1440, height: 900 }
  const TITLE_BAR = 28

  const layout = $derived(SPOTLIGHT_LAYOUTS[size])
  // Shares of the screen, in percent. The room left around Spotlight is worked out from its full
  // height, as the background does, so a compact Spotlight opens out downward from where it is
  const width = $derived((layout.window.width / SCREEN.width) * 100)
  const fullHeight = $derived((layout.window.height / SCREEN.height) * 100)
  const height = $derived(
    layout.collapses ? ((TITLE_BAR + SPOTLIGHT_SEARCH_HEIGHT) / SCREEN.height) * 100 : fullHeight,
  )

  let screen = $state<HTMLElement>()
  let dragging = $state<{
    readonly start: SpotlightPosition
    readonly pointer: { readonly x: number; readonly y: number }
  } | null>(null)
  let shown = $state<SpotlightPosition | null>(null)
  const position = $derived(shown ?? value)

  const startDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging = { start: value, pointer: { x: event.clientX, y: event.clientY } }
  }

  const drag = (event: PointerEvent) => {
    if (dragging === null || screen === undefined) return
    const box = screen.getBoundingClientRect()
    const roomAcross = box.width * (1 - width / 100)
    const roomDown = box.height * (1 - fullHeight / 100)
    shown = draggedPosition(dragging.start, {
      x: roomAcross === 0 ? 0 : (event.clientX - dragging.pointer.x) / roomAcross,
      y: roomDown === 0 ? 0 : (event.clientY - dragging.pointer.y) / roomDown,
    })
  }

  const endDrag = () => {
    if (dragging === null) return
    dragging = null
    if (shown !== null) onchange(shown)
    shown = null
  }

  const nudge = (event: KeyboardEvent) => {
    const nudged = nudgedPosition(value, event.key, event.shiftKey)
    if (nudged === null) return
    event.preventDefault()
    onchange(nudged)
  }

  const percent = (share: number) => Math.round(share * 100)
</script>

<div class="picker" role="group" aria-labelledby={labelId}>
  <span id={labelId} class="label">{label}</span>
  <div bind:this={screen} class="screen" class:dragging={dragging !== null}>
    <span class="toolbar"></span>
    <span class="side-panel"></span>
    {#if dragging !== null}
      <!-- Lines along Spotlight's edges, out to the window's, while it is being dragged -->
      <span class="guide across" style:top="{(100 - fullHeight) * position.y}%"></span>
      <span class="guide down" style:left="{(100 - width) * position.x}%"></span>
      <span class="guide down" style:left="{(100 - width) * position.x + width}%"></span>
    {/if}
    <button
      type="button"
      class="spotlight"
      style:left="{(100 - width) * position.x}%"
      style:top="{(100 - fullHeight) * position.y}%"
      style:width="{width}%"
      style:height="{height}%"
      aria-label="{label}: {valueText(percent(position.x), percent(position.y))}"
      aria-describedby={instructionsId}
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onkeydown={nudge}
    >
      <span class="search"><i></i><b></b></span>
      {#if !layout.collapses}
        {#each { length: 5 }, index (index)}
          <span class="row" class:selected={index === 0}><i></i><b></b></span>
        {/each}
      {/if}
    </button>
  </div>
  <p id={instructionsId} class="instructions">{instructions}</p>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 11px;
  }

  .label {
    font-size: 14px;
    letter-spacing: -0.003em;
  }

  .screen {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 0.5px solid var(--control-edge);
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 4%, transparent);
    user-select: none;
    touch-action: none;
  }

  .toolbar {
    position: absolute;
    inset: 0 0 auto;
    height: 5%;
    border-bottom: 0.5px solid var(--control-edge);
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }

  .side-panel {
    position: absolute;
    top: 5%;
    bottom: 0;
    left: 0;
    width: 17%;
    border-right: 0.5px solid var(--control-edge);
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .guide {
    position: absolute;
    pointer-events: none;
  }

  .guide.across {
    right: 0;
    left: 0;
    border-top: 1px dashed color-mix(in srgb, var(--text) 40%, transparent);
  }

  .guide.down {
    top: 0;
    bottom: 0;
    border-left: 1px dashed color-mix(in srgb, var(--text) 40%, transparent);
  }

  .spotlight {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-sizing: border-box;
    padding: 0;
    overflow: hidden;
    border: 0.5px solid var(--control-edge);
    border-radius: 6px;
    background: var(--control-face);
    box-shadow:
      0 6px 18px rgb(0 0 0 / 0.14),
      0 1px 3px rgb(0 0 0 / 0.08);
    cursor: grab;
  }

  .dragging .spotlight {
    cursor: grabbing;
  }

  .search {
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 7px;
    border-bottom: 0.5px solid var(--divider);
  }

  .row {
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
    height: 12px;
    margin: 0 4px;
    padding: 0 4px;
    border-radius: 3px;
  }

  .row.selected {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }

  .search i,
  .row i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text) 25%, transparent);
  }

  .search i {
    border-radius: 50%;
  }

  .search b,
  .row b {
    width: 45%;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .instructions {
    max-width: 60ch;
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.55;
  }
</style>
