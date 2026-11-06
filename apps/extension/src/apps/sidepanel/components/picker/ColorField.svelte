<script lang="ts" module>
  import { hueWheelBackground } from "../../logic/space-themes"

  const wheel = hueWheelBackground()
  const PRIMARY_INDEX = 0
</script>

<script lang="ts">
  import { Option } from "effect"
  import { colorAtPoint, moveColor, pointOfColor, swatchOf, type ThemeColor } from "#modules/theme"
  import type { Size } from "../../logic/menu-position"
  import { fieldOffsetOf, pickerPointAt, pointAfterKey } from "../../logic/picker-geometry"
  import { getSidebarContext } from "../../state/sidebar-context"

  interface Props {
    colors: ReadonlyArray<ThemeColor>
    /** Called continuously as the value changes. onSettle follows when the drag is released. */
    onChange: (colors: ReadonlyArray<ThemeColor>) => void
    onSettle: () => void
  }

  const { colors, onChange, onSettle }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  let field = $state<HTMLDivElement>()
  let size = $state<Size>({ width: 0, height: 0 })
  let draggedIndex: number | null = null

  // Not followed with a ResizeObserver: the picker keeps its size while open, unless the side panel
  // itself is resized
  const measure = (node: HTMLElement) => {
    const update = () => {
      size = { width: node.clientWidth, height: node.clientHeight }
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }

  const colorUnder = (event: PointerEvent): ThemeColor => {
    const bounds = field?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 }
    return colorAtPoint(
      pickerPointAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, bounds),
    )
  }

  const indexToGrab = (event: PointerEvent): number => {
    const pointUnderPointer =
      event.target instanceof Element ? event.target.closest("[data-color-index]") : null
    return Number(pointUnderPointer?.getAttribute("data-color-index") ?? PRIMARY_INDEX)
  }

  const grab = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    draggedIndex = indexToGrab(event)
    field?.setPointerCapture?.(event.pointerId)
    onChange(moveColor(colors, draggedIndex, colorUnder(event)))
  }

  const drag = (event: PointerEvent) => {
    if (draggedIndex === null) return
    onChange(moveColor(colors, draggedIndex, colorUnder(event)))
  }

  const release = (event: PointerEvent) => {
    if (draggedIndex === null) return
    onChange(moveColor(colors, draggedIndex, colorUnder(event)))
    draggedIndex = null
    onSettle()
  }

  const nudge = (event: KeyboardEvent, index: number, color: ThemeColor) => {
    const moved = pointAfterKey(pointOfColor(color), event.key)
    if (Option.isNone(moved)) return
    event.preventDefault()
    onChange(moveColor(colors, index, colorAtPoint(moved.value)))
  }
</script>

<div
  bind:this={field}
  class="field"
  role="group"
  aria-label={t("sidepanel.theme.colors")}
  {@attach measure}
  onpointerdown={grab}
  onpointermove={drag}
  onpointerup={release}
  onpointercancel={release}
>
  <span class="dots"></span>
  <span class="dots tinted" style:--wheel={wheel}></span>
  {#if colors.length === 0}
    <p class="hint">{t("sidepanel.theme.colorHint")}</p>
  {/if}
  {#each colors as color, index (index)}
    {@const offset = fieldOffsetOf(pointOfColor(color), size)}
    <button
      class="point"
      class:primary={index === PRIMARY_INDEX}
      type="button"
      aria-label={index === PRIMARY_INDEX
        ? t("sidepanel.theme.primaryColor")
        : t("sidepanel.theme.nthColor", { n: index + 1 })}
      data-color-index={index}
      style:left="{offset.x}px"
      style:top="{offset.y}px"
      style:--swatch={swatchOf(color)}
      onkeydown={(event) => nudge(event, index, color)}
      onkeyup={onSettle}
    ></button>
  {/each}
</div>

<style>
  .field {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    touch-action: none;
  }

  .dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgb(255 255 255 / 0.2) 0.9px, transparent 1.3px);
    background-size: 6px 6px;
    background-position: center;
    pointer-events: none;
  }

  .dots.tinted {
    background: var(--wheel);
    opacity: 0.45;
    -webkit-mask: radial-gradient(circle, #000 0.9px, transparent 1.3px) center / 6px 6px;
    mask: radial-gradient(circle, #000 0.9px, transparent 1.3px) center / 6px 6px;
  }

  .hint {
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    margin: 0;
    color: rgb(255 255 255 / 0.86);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .point {
    --size: 22px;

    position: absolute;
    width: var(--size);
    height: var(--size);
    padding: 0;
    border: 2px solid #fff;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow:
      0 0 22px 6px color-mix(in srgb, var(--swatch) 55%, transparent),
      0 2px 6px rgb(0 0 0 / 0.35);
    transform: translate(-50%, -50%);
    touch-action: none;
  }

  .point.primary {
    --size: 40px;

    z-index: 1;
    border-width: 3px;
  }

  .point:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.7);
    outline-offset: 3px;
  }
</style>
