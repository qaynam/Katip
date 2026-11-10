<script lang="ts">
  import type { Translator } from "#modules/i18n"
  import { appearanceOf, type ColorScheme, settleTheme, type SpaceTheme } from "#modules/theme"
  import ThemeEditor from "../../sidepanel/components/picker/ThemeEditor.svelte"
  import MiniSidebar from "./MiniSidebar.svelte"
  import Stage from "./Stage.svelte"

  let {
    theme,
    spaceName,
    scheme,
    t,
    onsave,
  }: {
    theme: SpaceTheme
    spaceName: string
    scheme: ColorScheme
    t: Translator["t"]
    /** Called with each theme to keep: once a drag is let go of, and for every change in one step. */
    onsave: (theme: SpaceTheme) => void
  } = $props()

  // What the editor shows while a color is being dragged, before it is saved. It stays after
  // saving, until the next drag, so the editor doesn't jump back while the saved theme comes in
  let draft = $state.raw<SpaceTheme | null>(null)
  const shown = $derived(draft ?? theme)
  const appearance = $derived(appearanceOf(shown, scheme))

  const keep = (next: SpaceTheme) => {
    draft = settleTheme(next)
    onsave(draft)
  }
</script>

<Stage glow="personal" decorative={false} fitsContent>
  <div class="scene">
    <div
      class="sidebar"
      style:--tint={appearance.background}
      style:--ink={appearance.text}
      aria-hidden="true"
    >
      <MiniSidebar rows={9} tint="transparent">
        <span class="space-name">{spaceName}</span>
      </MiniSidebar>
    </div>
    <div class="editor">
      <ThemeEditor
        theme={shown}
        {t}
        onPreview={(next) => (draft = next)}
        onSettle={() => {
          if (draft !== null) keep(draft)
        }}
        onCommit={keep}
      />
    </div>
  </div>
</Stage>

<style>
  .scene {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    align-items: stretch;
    justify-content: center;
    gap: 28px;
  }

  .sidebar {
    width: 190px;
    min-height: 320px;
    overflow: hidden;
    border-radius: 16px;
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

  .editor {
    flex: none;
    width: 340px;
    max-width: 100%;
  }
</style>
