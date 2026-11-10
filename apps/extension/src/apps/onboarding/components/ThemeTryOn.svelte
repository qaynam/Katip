<script lang="ts">
  import {
    appearanceOf,
    colorAtPoint,
    type ColorScheme,
    hueWheelBackground,
    moveColor,
    pointOfColor,
    settleTheme,
    type SpaceTheme,
    type ThemeColor,
  } from "#modules/theme"
  import MiniSidebar from "./MiniSidebar.svelte"
  import Stage from "./Stage.svelte"

  let {
    theme,
    spaceName,
    scheme,
    wheelLabel,
    onsettle,
  }: {
    theme: SpaceTheme
    spaceName: string
    scheme: ColorScheme
    /** Names the color circle for screen readers. */
    wheelLabel: string
    /** Called with the theme once a color is let go of, to save it. */
    onsettle: (theme: SpaceTheme) => void
  } = $props()

  const wheel = hueWheelBackground()

  let dragged = $state.raw<SpaceTheme | null>(null)
  const shown = $derived(dragged ?? theme)
  const appearance = $derived(appearanceOf(shown, scheme))
  const [primary] = $derived(shown.colors)
  const dot = $derived(pointOfColor(primary ?? { hue: 0, chroma: 0 }))

  let field = $state<HTMLElement>()

  const withPrimary = (color: ThemeColor): SpaceTheme => ({
    ...theme,
    colors: moveColor(theme.colors, 0, color),
  })

  const colorUnder = (event: PointerEvent): ThemeColor => {
    const box = field?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 }
    const radius = box.width / 2
    return colorAtPoint({
      x: (event.clientX - box.left - radius) / radius,
      y: (radius - (event.clientY - box.top)) / radius,
    })
  }

  const grab = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragged = withPrimary(colorUnder(event))
  }

  const drag = (event: PointerEvent) => {
    if (dragged !== null) dragged = withPrimary(colorUnder(event))
  }

  const release = () => {
    if (dragged === null) return
    onsettle(settleTheme(dragged))
    dragged = null
  }

  // Left and right turn the hue; up and down make the color more or less vivid
  const nudge = (event: KeyboardEvent) => {
    const color = primary ?? { hue: 0, chroma: 0.5 }
    const steps: Readonly<Record<string, ThemeColor>> = {
      ArrowLeft: { hue: (color.hue + 350) % 360, chroma: color.chroma },
      ArrowRight: { hue: (color.hue + 10) % 360, chroma: color.chroma },
      ArrowUp: { hue: color.hue, chroma: Math.min(color.chroma + 0.1, 1) },
      ArrowDown: { hue: color.hue, chroma: Math.max(color.chroma - 0.1, 0) },
    }
    const moved = steps[event.key]
    if (moved === undefined) return
    event.preventDefault()
    onsettle(settleTheme(withPrimary(moved)))
  }
</script>

<Stage glow="personal" decorative={false}>
  <div class="scene">
    <div
      class="sidebar"
      style:--tint={appearance.background}
      style:--ink={appearance.text}
      aria-hidden="true"
    >
      <MiniSidebar rows={7} tint="transparent">
        <span class="space-name">{spaceName}</span>
      </MiniSidebar>
    </div>
    <div
      bind:this={field}
      class="wheel"
      style:background={wheel}
      role="slider"
      tabindex="0"
      aria-label={wheelLabel}
      aria-valuetext="{Math.round(primary?.hue ?? 0)}°"
      aria-valuenow={Math.round(primary?.hue ?? 0)}
      aria-valuemin={0}
      aria-valuemax={359}
      onpointerdown={grab}
      onpointermove={drag}
      onpointerup={release}
      onpointercancel={release}
      onkeydown={nudge}
    >
      <span class="dot" style:left="{50 + dot.x * 50}%" style:top="{50 - dot.y * 50}%"></span>
    </div>
  </div>
</Stage>

<style>
  .scene {
    display: flex;
    align-items: center;
    gap: 9cqh;
  }

  .sidebar {
    width: 42cqh;
    height: 80cqh;
    overflow: hidden;
    border-radius: 4cqh;
    background: var(--tint);
    box-shadow: var(--window-shadow);
    color: var(--ink);
  }

  .space-name {
    display: block;
    margin: 0 0.4rem 0.5rem;
    overflow: hidden;
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .wheel {
    position: relative;
    width: 70cqh;
    height: 70cqh;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px var(--hairline),
      var(--window-shadow);
    cursor: crosshair;
    touch-action: none;
  }

  .dot {
    position: absolute;
    width: 6cqh;
    height: 6cqh;
    box-sizing: border-box;
    border: 0.9cqh solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0.5cqh 1.5cqh rgb(0 0 0 / 0.3);
    translate: -50% -50%;
    pointer-events: none;
  }
</style>
