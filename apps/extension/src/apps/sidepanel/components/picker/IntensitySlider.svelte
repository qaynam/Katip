<script lang="ts" module>
  const WAVE_WIDTH = 200
  const WAVE_HEIGHT = 32
  const HALF_WAVES = 18
  const MAX_WAVE_AMPLITUDE = 10

  const halfWaveWidth = WAVE_WIDTH / HALF_WAVES

  /** The wave grows from a flat line at no intensity to its full height at the most. */
  const wavePath = (intensity: number) =>
    [
      `M0 ${WAVE_HEIGHT / 2}`,
      `Q${halfWaveWidth / 2} ${WAVE_HEIGHT / 2 - MAX_WAVE_AMPLITUDE * intensity} ${halfWaveWidth} ${WAVE_HEIGHT / 2}`,
      ...Array.from(
        { length: HALF_WAVES - 1 },
        (_, index) => `T${halfWaveWidth * (index + 2)} ${WAVE_HEIGHT / 2}`,
      ),
    ].join(" ")

  const THUMB_WIDTH_PX = 16
</script>

<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import { Option } from "effect"
  import { sliderValueAt, valueAfterKey } from "../../logic/picker-geometry"

  interface Props {
    value: number
    /** While false, the thumb is hidden and input is ignored. */
    isAvailable: boolean
    onChange: (value: number) => void
    onSettle: () => void
    t: Translator["t"]
  }

  const { value, isAvailable, onChange, onSettle, t }: Props = $props()
  const id = $props.id()
  const clipId = `${id}-lit`
  let isDragging = false
  const wave = $derived(wavePath(isAvailable ? value : 0))

  const valueAt = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return sliderValueAt(event.clientX - bounds.left, {
      length: bounds.width,
      thumbLength: THUMB_WIDTH_PX,
    })
  }

  const grab = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!isAvailable || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    isDragging = true
    onChange(valueAt(event))
  }

  const drag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (isDragging) onChange(valueAt(event))
  }

  const release = () => {
    if (!isDragging) return
    isDragging = false
    onSettle()
  }

  const adjust = (event: KeyboardEvent) => {
    if (!isAvailable) return
    const next = valueAfterKey(value, event.key)
    if (Option.isNone(next)) return
    event.preventDefault()
    onChange(next.value)
  }
</script>

<div
  class="slider"
  class:available={isAvailable}
  role="slider"
  tabindex={isAvailable ? 0 : -1}
  aria-label={t("sidepanel.theme.intensity")}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(value * 100)}
  aria-disabled={!isAvailable}
  style:--value={value}
  style:--thumb-width="{THUMB_WIDTH_PX}px"
  onpointerdown={grab}
  onpointermove={drag}
  onpointerup={release}
  onpointercancel={release}
  onkeydown={adjust}
  onkeyup={onSettle}
>
  <svg
    class="wave"
    viewBox="0 0 {WAVE_WIDTH} {WAVE_HEIGHT}"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <clipPath id={clipId}>
      <rect width={isAvailable ? value * WAVE_WIDTH : 0} height={WAVE_HEIGHT} />
    </clipPath>
    <path class="dim" d={wave} vector-effect="non-scaling-stroke" />
    <path class="lit" d={wave} clip-path="url(#{clipId})" vector-effect="non-scaling-stroke" />
  </svg>
  {#if isAvailable}
    <span class="thumb" data-thumb></span>
  {/if}
</div>

<style>
  .slider {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 48px;
    touch-action: none;
  }

  .slider:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.5);
    outline-offset: 2px;
    border-radius: 8px;
  }

  .wave {
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    width: 100%;
    height: 26px;
    overflow: visible;
    transform: translateY(-50%);
  }

  .wave path {
    fill: none;
    stroke-width: 2.6px;
    stroke-linecap: round;
  }

  .dim {
    stroke: rgb(255 255 255 / 0.22);
  }

  .lit {
    stroke: rgb(255 255 255 / 0.85);
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: calc(var(--value) * (100% - var(--thumb-width)));
    width: var(--thumb-width);
    height: 40px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
    transform: translateY(-50%);
    pointer-events: none;
  }
</style>
