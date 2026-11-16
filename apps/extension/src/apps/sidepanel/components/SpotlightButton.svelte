<script lang="ts">
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const shortcut = $derived(ctx.view.spotlightShortcut)
  // aria-keyshortcuts takes names such as "Alt+T"; the symbols Chrome writes on macOS (⌥T) aren't
  // valid there, so those are shown but not announced
  const announcedShortcut = $derived(
    shortcut !== null && /^[\w ]+(\+[\w ]+)+$/.test(shortcut) ? shortcut : undefined,
  )
</script>

<button
  class="spotlight"
  type="button"
  aria-keyshortcuts={announcedShortcut}
  onclick={() => void ctx.run({ _tag: "OpenSpotlight", windowId: ctx.view.windowId })}
>
  <Icon name="search" size={14} />
  <span class="label">{t("sidepanel.spotlight.button")}</span>
  {#if shortcut !== null}
    <kbd class="shortcut" aria-hidden="true">{shortcut}</kbd>
  {/if}
</button>

<style>
  .spotlight {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 8px;
    min-width: 0;
    height: 34px;
    padding: 0 8px 0 11px;
    border: none;
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
    color: var(--text-muted);
    font-size: 13px;
    text-align: start;
    transition:
      background-color 140ms ease,
      color 140ms ease;
  }

  .spotlight:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .label {
    flex: 1;
  }

  .shortcut {
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--surface-hover);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.85;
  }
</style>
