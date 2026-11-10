<script lang="ts" module>
  import { DEFAULT_TEXTURE, textureTileOf } from "#modules/theme"

  const panelGrain = textureTileOf(DEFAULT_TEXTURE).image
</script>

<script lang="ts">
  import type { MessageKey, Translator } from "#modules/i18n"
  import {
    addHarmonyColor,
    applyPreset,
    MAX_THEME_COLORS,
    removeLastColor,
    type SpaceTheme,
    type ThemeMode,
  } from "#modules/theme"
  import Icon, { type IconName } from "../Icon.svelte"
  import ColorField from "./ColorField.svelte"
  import GrainDial from "./GrainDial.svelte"
  import IntensitySlider from "./IntensitySlider.svelte"
  import PresetRow from "./PresetRow.svelte"

  interface Props {
    theme: SpaceTheme
    t: Translator["t"]
    /** Called continuously while a color, the intensity or the grain is dragged. */
    onPreview: (theme: SpaceTheme) => void
    /** Called when a drag that previewed is released. */
    onSettle: () => void
    /** Called for a change made in one step, such as picking a preset. */
    onCommit: (theme: SpaceTheme) => void
  }

  const { theme, t, onPreview, onSettle, onCommit }: Props = $props()
  const hasColor = $derived(theme.colors.length > 0)

  const modes = [
    { mode: "auto", label: "sidepanel.theme.auto", icon: "sparkles" },
    { mode: "light", label: "sidepanel.theme.light", icon: "sun" },
    { mode: "dark", label: "sidepanel.theme.dark", icon: "moon" },
  ] as const satisfies ReadonlyArray<{ mode: ThemeMode; label: MessageKey; icon: IconName }>
</script>

<!-- The editor of a Space's theme, the same wherever it is placed: the side panel shows it in a
     popover, and the welcome tour in its theme step -->
<div class="editor" style:--panel-grain={panelGrain}>
  <div class="field-area">
    <ColorField
      {t}
      colors={theme.colors}
      onChange={(colors) => onPreview({ ...theme, colors })}
      {onSettle}
    />
    <div class="modes" role="radiogroup" aria-label={t("sidepanel.theme.scheme")}>
      {#each modes as option (option.mode)}
        <button
          class="mode"
          type="button"
          role="radio"
          aria-checked={theme.mode === option.mode}
          aria-label={t(option.label)}
          title={t(option.label)}
          onclick={() => onCommit({ ...theme, mode: option.mode })}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
    </div>
    <div class="count">
      <button
        type="button"
        aria-label={t("sidepanel.theme.removeColor")}
        disabled={theme.colors.length <= 1}
        onclick={() => onCommit({ ...theme, colors: removeLastColor(theme.colors) })}
      >
        <Icon name="minus" size={14} />
      </button>
      <button
        type="button"
        aria-label={t("sidepanel.theme.addColor")}
        disabled={!hasColor || theme.colors.length >= MAX_THEME_COLORS}
        onclick={() => onCommit({ ...theme, colors: addHarmonyColor(theme.colors) })}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  </div>

  <PresetRow {t} onPick={(preset) => onCommit(applyPreset(theme, preset))} />

  <div class="tuning">
    <IntensitySlider
      {t}
      value={theme.intensity}
      isAvailable={hasColor}
      onChange={(intensity) => onPreview({ ...theme, intensity })}
      {onSettle}
    />
    <GrainDial
      {t}
      value={theme.grain}
      texture={theme.texture}
      isAvailable={hasColor}
      onChange={(grain) => onPreview({ ...theme, grain })}
      {onSettle}
      onTextureChange={(texture) => onCommit({ ...theme, texture })}
    />
  </div>
</div>

<style>
  .editor {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
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
  }

  .editor::after {
    position: absolute;
    inset: 0;
    background-image: var(--panel-grain);
    background-size: 180px 180px;
    mix-blend-mode: overlay;
    opacity: 0.18;
    content: "";
    pointer-events: none;
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

  .editor :focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.55);
    outline-offset: 2px;
  }
</style>
