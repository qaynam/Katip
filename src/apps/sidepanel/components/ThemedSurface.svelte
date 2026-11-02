<script lang="ts">
  import type { Snippet } from "svelte"
  import { appearanceOf, type ColorScheme, type SpaceTheme } from "#modules/theme"
  import { currentSystemScheme, watchSystemScheme } from "../state/system-scheme"
  import ThemeBackdrop from "./ThemeBackdrop.svelte"

  interface Props {
    theme: SpaceTheme
    /** Pass a value unique to each Space to fade the background when switching Spaces. */
    transitionKey: string
    children: Snippet
  }

  const { theme, transitionKey, children }: Props = $props()

  let systemScheme = $state<ColorScheme>(currentSystemScheme())
  $effect(() => watchSystemScheme((scheme) => (systemScheme = scheme)))

  const appearance = $derived(appearanceOf(theme, systemScheme))
</script>

<div
  class="katip-root"
  data-scheme={appearance.scheme}
  style:--text={appearance.text}
  style:--text-muted={appearance.mutedText}
  style:--surface-hover={appearance.hoverSurface}
  style:--surface-raised={appearance.raisedSurface}
  style:--surface-active={appearance.activeSurface}
  style:--divider={appearance.divider}
  style:--accent={appearance.accent}
>
  <ThemeBackdrop
    background={appearance.background}
    {transitionKey}
    grainOpacity={appearance.grainOpacity}
  />
  {@render children()}
</div>
