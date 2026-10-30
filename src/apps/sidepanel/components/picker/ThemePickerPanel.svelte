<script lang="ts">
  import { untrack } from "svelte"
  import {
    addHarmonyColor,
    MAX_THEME_COLORS,
    neutralTheme,
    removeLastColor,
    type SpaceTheme,
    type ThemeMode,
  } from "#modules/theme"
  import type { Point } from "../../logic/menu-position"
  import { getSidebarContext } from "../../state/sidebar-context"
  import type { OpenThemePicker } from "../../state/theme-picker.svelte"
  import Icon, { type IconName } from "../Icon.svelte"
  import { popoverPosition } from "../popover-position"
  import ColorField from "./ColorField.svelte"
  import GrainDial from "./GrainDial.svelte"
  import IntensitySlider from "./IntensitySlider.svelte"
  import PresetRow from "./PresetRow.svelte"

  interface Props {
    picker: OpenThemePicker
    onClose: () => void
  }

  const { picker, onClose }: Props = $props()
  const ctx = getSidebarContext()

  const spaceId = untrack(() => picker.spaceId)
  const theme = $derived(
    ctx.themeDraft.themeFor(spaceId) ??
      ctx.view.spaces.find((space) => space.id === spaceId)?.theme ??
      neutralTheme,
  )
  const hasColor = $derived(theme.colors.length > 0)

  const preview = (next: SpaceTheme) => ctx.themeDraft.preview(spaceId, next)
  const settle = () => ctx.themeDraft.settle()
  const commit = (next: SpaceTheme) => ctx.themeDraft.commit(spaceId, next)

  const modes: ReadonlyArray<{ mode: ThemeMode; label: string; icon: IconName }> = [
    { mode: "auto", label: "自動", icon: "sparkles" },
    { mode: "light", label: "ライト", icon: "sun" },
    { mode: "dark", label: "ダーク", icon: "moon" },
  ]

  let panel = $state<HTMLDivElement>()
  let position = $state<Point>(untrack(() => ({ x: picker.anchor.left, y: picker.anchor.bottom })))

  const placeAndFocus = (node: HTMLDivElement) => {
    position = popoverPosition(node, picker.anchor)
    if (picker.takesFocus) node.focus()
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }

  const closeIfOutside = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Node) || panel?.contains(target) === true) return
    onClose()
  }
</script>

<svelte:window onkeydown={closeOnEscape} onpointerdown={closeIfOutside} />

<div
  bind:this={panel}
  class="picker"
  role="dialog"
  aria-label="テーマ"
  tabindex="-1"
  style:left="{position.x}px"
  style:top="{position.y}px"
  {@attach placeAndFocus}
>
  <div class="field-area">
    <ColorField
      colors={theme.colors}
      onChange={(colors) => preview({ ...theme, colors })}
      onSettle={settle}
    />
    <div class="modes" role="radiogroup" aria-label="ライトとダーク">
      {#each modes as option (option.mode)}
        <button
          class="mode"
          type="button"
          role="radio"
          aria-checked={theme.mode === option.mode}
          aria-label={option.label}
          title={option.label}
          onclick={() => commit({ ...theme, mode: option.mode })}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
    </div>
    <div class="count">
      <button
        type="button"
        aria-label="色を減らす"
        disabled={theme.colors.length <= 1}
        onclick={() => commit({ ...theme, colors: removeLastColor(theme.colors) })}
      >
        <Icon name="minus" size={14} />
      </button>
      <button
        type="button"
        aria-label="色を増やす"
        disabled={!hasColor || theme.colors.length >= MAX_THEME_COLORS}
        onclick={() => commit({ ...theme, colors: addHarmonyColor(theme.colors) })}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  </div>

  <PresetRow onPick={(colors) => commit({ ...theme, colors })} />

  <div class="tuning">
    <IntensitySlider
      value={theme.intensity}
      isAvailable={hasColor}
      onChange={(intensity) => preview({ ...theme, intensity })}
      onSettle={settle}
    />
    <GrainDial
      value={theme.grain}
      isAvailable={hasColor}
      onChange={(grain) => preview({ ...theme, grain })}
      onSettle={settle}
    />
  </div>
</div>

<style>
  .picker {
    position: absolute;
    z-index: 22;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(340px, calc(100% - 16px));
    padding: 8px 10px 10px;
    overflow: hidden;
    border: 0.5px solid rgb(255 255 255 / 0.12);
    border-radius: 18px;
    background: rgb(30 30 34 / 0.8);
    box-shadow:
      0 24px 60px rgb(0 0 0 / 0.45),
      0 2px 8px rgb(0 0 0 / 0.25);
    color: rgb(255 255 255 / 0.92);
    color-scheme: dark;
    -webkit-backdrop-filter: blur(30px) saturate(1.5);
    backdrop-filter: blur(30px) saturate(1.5);
    animation: picker-in 160ms ease-out;
  }

  .picker::after {
    position: absolute;
    inset: 0;
    background-image: var(--grain-image);
    background-size: 180px 180px;
    mix-blend-mode: overlay;
    opacity: 0.18;
    content: "";
    pointer-events: none;
  }

  .picker:focus {
    outline: none;
  }

  .field-area {
    position: relative;
    height: 268px;
    margin: 0 -2px;
    border-radius: 12px;
    background: rgb(255 255 255 / 0.035);
  }

  .modes {
    position: absolute;
    top: 10px;
    left: 50%;
    z-index: 2;
    display: flex;
    gap: 6px;
    transform: translateX(-50%);
  }

  .mode {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1.5px solid transparent;
    border-radius: 7px;
    background: none;
    color: rgb(255 255 255 / 0.8);
  }

  .mode:hover {
    color: #fff;
  }

  .mode[aria-checked="true"] {
    border-color: rgb(255 255 255 / 0.55);
    color: #fff;
  }

  .count {
    position: absolute;
    bottom: 10px;
    left: 50%;
    z-index: 2;
    display: flex;
    gap: 12px;
    transform: translateX(-50%);
  }

  .count button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: rgb(255 255 255 / 0.85);
  }

  .count button:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.1);
  }

  .count button:disabled {
    color: rgb(255 255 255 / 0.25);
  }

  .tuning {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 2px 0 6px;
  }

  .picker :focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.55);
    outline-offset: 2px;
  }

  @keyframes picker-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picker {
      animation: none;
    }
  }
</style>
