<script lang="ts" module>
  import { appearanceOf } from "#modules/theme"
  import { SETTINGS_THEME } from "./categories"

  // Not the page's accent: the light scheme darkens it to stand out on a light page, and the
  // overlay is dark in both schemes
  const LIT = appearanceOf(SETTINGS_THEME, "dark").accent
</script>

<script lang="ts">
  import { Effect } from "effect"
  import { untrack } from "svelte"
  import type { Translator } from "#modules/i18n"
  import {
    DEFAULT_SPOTLIGHT_POSITION,
    type SpotlightPosition,
    type SpotlightSize,
  } from "#modules/spotlight"
  import { CurrentWindow } from "./current-window"
  import type { OptionsRuntime } from "./options-runtime"
  import PushButton from "./PushButton.svelte"
  import {
    draggedPlacement,
    type Extent,
    GRID_LINES,
    nudgedPosition,
    type Placement,
    spotlightOffsetOf,
    spotlightShareOf,
  } from "./spotlight-position"
  import SpotlightShape from "./SpotlightShape.svelte"

  let {
    runtime,
    t,
    size,
    initial,
    onsave,
    oncancel,
  }: {
    runtime: OptionsRuntime
    t: Translator["t"]
    size: SpotlightSize
    initial: SpotlightPosition
    onsave: (position: SpotlightPosition) => void
    oncancel: () => void
  } = $props()

  const id = $props.id()
  const hintId = `${id}-hint`
  const RESTING: Placement["guides"] = { x: null, y: null }

  // Read here rather than in an effect: the overlay takes focus as it mounts, before this
  // component's effects run
  const returnFocusTo = document.activeElement

  let overlay = $state<HTMLElement>()
  let browserWindow = $state<Extent | null>(null)
  let position = $state(untrack(() => initial))
  let guides = $state(RESTING)
  let dragging = $state<{
    readonly start: SpotlightPosition
    readonly pointer: { readonly x: number; readonly y: number }
  } | null>(null)
  let pulses = $state(0)

  const share = $derived(browserWindow === null ? null : spotlightShareOf(browserWindow, size))
  const barOnTop = $derived(position.y > 0.5)

  const percent = (fraction: number) => Math.round(fraction * 100)
  const cssPercent = (fraction: number) => `${fraction * 100}%`
  const lineAt = (fraction: number) => `clamp(1px, ${fraction * 100}%, calc(100% - 1px))`

  const readWindowSize = () =>
    runtime.runCallback(
      CurrentWindow.use((current) => current.size).pipe(
        Effect.tap((measured) =>
          Effect.sync(() => {
            browserWindow = measured
          }),
        ),
      ),
    )

  $effect(() => readWindowSize())

  $effect(() => () => {
    if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus()
  })

  const focus = (element: HTMLElement) => element.focus()

  const moveTo = (next: SpotlightPosition) => {
    position = next
    guides = RESTING
  }

  const engages = (next: Placement, axis: "x" | "y") =>
    next.guides[axis] !== null && next.position[axis] !== position[axis]

  const startDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging = { start: position, pointer: { x: event.clientX, y: event.clientY } }
  }

  const drag = (event: PointerEvent) => {
    if (dragging === null || overlay === undefined || share === null) return
    const next = draggedPlacement(
      dragging.start,
      { x: event.clientX - dragging.pointer.x, y: event.clientY - dragging.pointer.y },
      overlay.getBoundingClientRect(),
      share,
    )
    if (engages(next, "x") || engages(next, "y")) pulses += 1
    position = next.position
    guides = next.guides
  }

  const endDrag = () => {
    dragging = null
    guides = RESTING
  }

  const keepFocusInside = (event: KeyboardEvent) => {
    if (overlay === undefined) return
    const focusable = [...overlay.querySelectorAll<HTMLElement>("button, [tabindex='0']")]
    const first = focusable.at(0)
    const last = focusable.at(-1)
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    const isLeaving = event.shiftKey
      ? active === first || active === overlay
      : active === last || !overlay.contains(active)
    if (!isLeaving) return
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      oncancel()
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      onsave(position)
    } else if (event.key === "Tab") {
      keepFocusInside(event)
    } else {
      const nudged = nudgedPosition(position, event.key, event.shiftKey)
      if (nudged === null) return
      event.preventDefault()
      moveTo(nudged)
    }
  }
</script>

<svelte:window onkeydown={handleKey} onresize={() => void readWindowSize()} />

<div
  bind:this={overlay}
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label={t("options.spotlight.position.dialogLabel")}
  aria-describedby={hintId}
  tabindex="-1"
  style:--lit={LIT}
  {@attach focus}
>
  {#each GRID_LINES as line (line)}
    <span class="grid down" class:center={line === 0.5} style:left={cssPercent(line)}></span>
    <span class="grid across" class:center={line === 0.5} style:top={cssPercent(line)}></span>
  {/each}

  {#if share !== null}
    {@const home = spotlightOffsetOf(DEFAULT_SPOTLIGHT_POSITION, share)}
    {@const offset = spotlightOffsetOf(position, share)}
    <span
      class="home"
      class:lit={guides.y?._tag === "Default"}
      style:left={cssPercent(home.left)}
      style:top={cssPercent(home.top)}
      style:width={cssPercent(share.width)}
      style:height={cssPercent(share.openingHeight)}
    ></span>
    <div
      class="mock"
      class:dragging={dragging !== null}
      role="slider"
      tabindex="0"
      aria-label={t("options.spotlight.position.label")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent(position.x)}
      aria-valuetext={t("options.spotlight.position.value", {
        across: percent(position.x),
        down: percent(position.y),
      })}
      aria-describedby={hintId}
      style:left={cssPercent(offset.left)}
      style:top={cssPercent(offset.top)}
      style:width={cssPercent(share.width)}
      style:height={cssPercent(share.openingHeight)}
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      {@attach focus}
    >
      <SpotlightShape {size} />
      {#if pulses > 0}
        {#key pulses}
          <span class="pulse"></span>
        {/key}
      {/if}
    </div>
    {#if guides.x?._tag === "Line"}
      <span class="guide down" style:left={lineAt(guides.x.at)}></span>
    {/if}
    {#if guides.y?._tag === "Line"}
      <span class="guide across" style:top={lineAt(guides.y.at)}></span>
    {/if}
  {/if}

  <div class="bar" class:top={barOnTop}>
    <p id={hintId} class="hint">{t("options.spotlight.position.hint")}</p>
    <div class="buttons">
      <PushButton onclick={() => moveTo(DEFAULT_SPOTLIGHT_POSITION)}>
        {t("options.spotlight.position.reset")}
      </PushButton>
      <PushButton onclick={oncancel}>{t("common.cancel")}</PushButton>
      <span class="primary">
        <PushButton onclick={() => onsave(position)}>
          {t("options.spotlight.position.done")}
        </PushButton>
      </span>
    </div>
  </div>
</div>

<style>
  .overlay {
    --focus-ring: rgb(255 255 255 / 0.7);

    position: fixed;
    inset: 0;
    z-index: 10;
    overflow: hidden;
    background: rgb(0 0 0 / 0.64);
    backdrop-filter: blur(8px);
    color: rgb(255 255 255 / 0.92);
    user-select: none;
    animation: fade-in 140ms ease-out;
  }

  .overlay:focus-visible {
    outline: none;
  }

  .grid,
  .guide,
  .home {
    position: absolute;
    pointer-events: none;
  }

  .grid {
    background: rgb(255 255 255 / 0.09);
  }

  .grid.center {
    background: rgb(255 255 255 / 0.17);
  }

  .grid.down,
  .guide.down {
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
  }

  .grid.across,
  .guide.across {
    right: 0;
    left: 0;
    transform: translateY(-50%);
  }

  .grid.down {
    width: 1px;
  }

  .grid.across {
    height: 1px;
  }

  .guide {
    background: var(--lit);
    box-shadow: 0 0 6px color-mix(in srgb, var(--lit) 70%, transparent);
  }

  .guide.down {
    width: 2px;
  }

  .guide.across {
    height: 2px;
  }

  .home {
    box-sizing: border-box;
    border: 1px dashed rgb(255 255 255 / 0.3);
    border-radius: 10px;
    transition: border-color 120ms ease;
  }

  .home.lit {
    border-style: solid;
    border-color: var(--lit);
  }

  .mock {
    position: absolute;
    box-sizing: border-box;
    border-radius: 10px;
    background: var(--mock-face);
    box-shadow:
      0 0 0 0.5px var(--glass-border),
      0 24px 64px rgb(0 0 0 / 0.45),
      0 4px 14px rgb(0 0 0 / 0.25);
    color: var(--glass-text);
    cursor: grab;
    touch-action: none;
  }

  :global(.katip-options[data-scheme="light"]) .mock {
    --mock-face: rgb(248 248 250 / 0.97);
  }

  :global(.katip-options[data-scheme="dark"]) .mock {
    --mock-face: rgb(40 40 46 / 0.97);
  }

  .mock:focus-visible {
    outline-offset: 4px;
  }

  .mock.dragging {
    cursor: grabbing;
  }

  .pulse {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: 0 0 0 2px var(--lit);
    opacity: 0;
    pointer-events: none;
    animation: pulse 380ms ease-out;
  }

  .bar {
    --control-face: rgb(255 255 255 / 0.1);
    --control-edge: rgb(255 255 255 / 0.14);
    --control-depth: 0 1px 1px rgb(0 0 0 / 0.4);

    position: absolute;
    bottom: 24px;
    left: 50%;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100% - 32px);
    padding: 8px 8px 8px 16px;
    border-radius: 14px;
    background: rgb(30 30 34 / 0.84);
    box-shadow:
      0 0 0 0.5px rgb(255 255 255 / 0.12),
      0 16px 40px rgb(0 0 0 / 0.42);
    transform: translateX(-50%);
    backdrop-filter: blur(20px) saturate(1.5);
  }

  .bar.top {
    top: 24px;
    bottom: auto;
  }

  .hint {
    min-width: 0;
    margin: 0;
    color: rgb(255 255 255 / 0.62);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.4;
  }

  .buttons {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .primary {
    --control-face: rgb(255 255 255 / 0.92);

    display: contents;
    color: rgb(24 24 28);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .bar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      padding: 10px;
      text-align: center;
    }

    .buttons {
      justify-content: center;
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes pulse {
    from {
      opacity: 1;
      transform: scale(1);
    }

    to {
      opacity: 0;
      transform: scale(1.025);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay {
      animation: none;
    }

    .pulse {
      animation-name: fade-out;
    }
  }
</style>
