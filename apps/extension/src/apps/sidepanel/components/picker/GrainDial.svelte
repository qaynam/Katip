<script lang="ts" module>
  const RING_DOTS = 24
  const RING_RADIUS = 28.5

  // The dots grow and stand out more clockwise from the top, as the grain does when the dial turns
  const ringDots = Array.from({ length: RING_DOTS }, (_, index) => {
    const share = index / (RING_DOTS - 1)
    const radians = (index / RING_DOTS) * 2 * Math.PI
    return {
      x: 32 + RING_RADIUS * Math.sin(radians),
      y: 32 - RING_RADIUS * Math.cos(radians),
      radius: 0.9 + 0.7 * share,
      opacity: 0.16 + 0.6 * share,
    }
  })
</script>

<script lang="ts">
  import { Option } from "effect"
  import { dialValueAt, valueAfterKey } from "../../logic/picker-geometry"
  import { getSidebarContext } from "../../state/sidebar-context"

  interface Props {
    value: number
    /** While false, the tick marks are hidden and input is ignored. */
    isAvailable: boolean
    onChange: (value: number) => void
    onSettle: () => void
  }

  const { value, isAvailable, onChange, onSettle }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  let isDragging = false

  const valueAt = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return dialValueAt(
      {
        x: event.clientX - (bounds.left + bounds.width / 2),
        y: event.clientY - (bounds.top + bounds.height / 2),
      },
      value,
    )
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
  class="dial"
  role="slider"
  tabindex={isAvailable ? 0 : -1}
  aria-label={t("sidepanel.theme.grain")}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(value * 100)}
  aria-disabled={!isAvailable}
  style:--turn={value}
  onpointerdown={grab}
  onpointermove={drag}
  onpointerup={release}
  onpointercancel={release}
  onkeydown={adjust}
  onkeyup={onSettle}
>
  <svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
    {#each ringDots as dot, index (index)}
      <circle class="dot" cx={dot.x} cy={dot.y} r={dot.radius} opacity={dot.opacity} />
    {/each}
  </svg>
  <span class="knob" aria-hidden="true"></span>
  {#if isAvailable}
    <span class="tick" data-tick></span>
  {/if}
</div>

<style>
  .dial {
    position: relative;
    flex: none;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    touch-action: none;
  }

  .dial:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.5);
    outline-offset: 2px;
  }

  .ring {
    display: block;
    width: 100%;
    height: 100%;
  }

  .dot {
    fill: #fff;
  }

  /* The knob shows the grain itself, stronger as the dial turns */
  .knob {
    position: absolute;
    inset: 11px;
    overflow: hidden;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.2);
    box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.25);
  }

  .knob::after {
    position: absolute;
    inset: 0;
    background-image: var(--grain-image);
    background-size: 120px 120px;
    opacity: calc(0.15 + 0.85 * var(--turn));
    content: "";
  }

  .tick {
    position: absolute;
    top: 0;
    left: calc(50% - 2px);
    width: 4px;
    height: 14px;
    border-radius: 2px;
    background: #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
    transform: rotate(calc(var(--turn) * 1turn));
    transform-origin: 2px 32px;
    pointer-events: none;
  }
</style>
