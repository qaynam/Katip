<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import {
    DEFAULT_SPOTLIGHT_POSITION,
    type SpotlightPosition,
    type SpotlightSize,
  } from "#modules/spotlight"
  import type { OptionsRuntime } from "./options-runtime"
  import PushButton from "./PushButton.svelte"
  import { spotlightOffsetOf, spotlightShareOf } from "./spotlight-position"
  import SpotlightPositionOverlay from "./SpotlightPositionOverlay.svelte"
  import SpotlightShape from "./SpotlightShape.svelte"

  let {
    runtime,
    t,
    size,
    value,
    onchange,
  }: {
    runtime: OptionsRuntime
    t: Translator["t"]
    size: SpotlightSize
    value: SpotlightPosition
    onchange: (position: SpotlightPosition) => void
  } = $props()

  const id = $props.id()
  const descriptionId = `${id}-description`

  // The browser window the picture stands for, so Spotlight is drawn to scale over it
  const SCREEN = { width: 1440, height: 900 }

  let isPositioning = $state(false)

  const share = $derived(spotlightShareOf(SCREEN, size))
  const offset = $derived(spotlightOffsetOf(value, share))

  const percent = (fraction: number) => Math.round(fraction * 100)
  const cssPercent = (fraction: number) => `${fraction * 100}%`

  const startPositioning = () => (isPositioning = true)

  const save = (position: SpotlightPosition) => {
    isPositioning = false
    onchange(position)
  }
</script>

<div class="setting">
  <div class="text">
    <span class="label">{t("options.spotlight.position.label")}</span>
    <p id={descriptionId} class="description">{t("options.spotlight.position.description")}</p>
    <div class="actions">
      <PushButton aria-describedby={descriptionId} onclick={startPositioning}>
        {t("options.spotlight.position.set")}
      </PushButton>
      <PushButton onclick={() => onchange(DEFAULT_SPOTLIGHT_POSITION)}>
        {t("options.spotlight.position.reset")}
      </PushButton>
    </div>
  </div>
  <div class="preview">
    <!-- The picture is only a larger target for the pointer. The button beside it opens the same
         overlay for the keyboard and for screen readers -->
    <div class="screen" aria-hidden="true" onclick={startPositioning}>
      <span class="toolbar"></span>
      <span class="side-panel"></span>
      <span
        class="spotlight"
        style:left={cssPercent(offset.left)}
        style:top={cssPercent(offset.top)}
        style:width={cssPercent(share.width)}
        style:height={cssPercent(share.openingHeight)}
      >
        <SpotlightShape {size} />
      </span>
    </div>
    <p class="value">
      {t("options.spotlight.position.value", { across: percent(value.x), down: percent(value.y) })}
    </p>
  </div>
</div>

{#if isPositioning}
  <SpotlightPositionOverlay
    {runtime}
    {t}
    {size}
    initial={value}
    onsave={save}
    oncancel={() => (isPositioning = false)}
  />
{/if}

<style>
  .setting {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px 24px;
    padding: 11px 0;
  }

  .text {
    flex: 1 1 240px;
    min-width: 0;
  }

  .label {
    display: block;
    font-size: 14px;
    letter-spacing: -0.003em;
  }

  .description {
    max-width: 60ch;
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .preview {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 200px;
  }

  .screen {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 0.5px solid var(--control-edge);
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 4%, transparent);
    transition: background-color 120ms ease;
  }

  .screen:hover {
    background: color-mix(in srgb, var(--text) 7%, transparent);
  }

  .toolbar {
    position: absolute;
    inset: 0 0 auto;
    height: 7%;
    border-bottom: 0.5px solid var(--control-edge);
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }

  .side-panel {
    position: absolute;
    top: 7%;
    bottom: 0;
    left: 0;
    width: 17%;
    border-right: 0.5px solid var(--control-edge);
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .spotlight {
    position: absolute;
    box-sizing: border-box;
    border: 0.5px solid var(--control-edge);
    border-radius: 4px;
    background: var(--control-face);
    box-shadow:
      0 4px 12px rgb(0 0 0 / 0.14),
      0 1px 3px rgb(0 0 0 / 0.08);
    color: var(--text);
  }

  .value {
    margin: 0;
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
</style>
