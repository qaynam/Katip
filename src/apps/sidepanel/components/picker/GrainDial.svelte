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
    <circle class="dots" cx="32" cy="32" r="29" />
    <circle class="knob" cx="32" cy="32" r="21" />
  </svg>
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

  .dots {
    fill: none;
    stroke: rgb(255 255 255 / 0.32);
    stroke-width: 2.2;
    stroke-dasharray: 0 5.69;
    stroke-linecap: round;
  }

  .knob {
    fill: rgb(0 0 0 / 0.28);
    stroke: rgb(255 255 255 / 0.14);
    stroke-width: 1;
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
