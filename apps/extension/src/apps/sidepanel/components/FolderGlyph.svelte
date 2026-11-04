<script lang="ts">
  import type { FolderIcon } from "#modules/pinned"
  import FolderIconGlyph from "./FolderIconGlyph.svelte"

  interface Props {
    isOpen: boolean
    /** The icon chosen for the folder, drawn inside it. */
    icon?: FolderIcon | null
  }

  const { isOpen, icon = null }: Props = $props()
</script>

<span class="folder" data-folder-glyph={isOpen ? "open" : "closed"}>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      class="back"
      d="M1.6 3.9A1.5 1.5 0 0 1 3.1 2.4h2.75a1.5 1.5 0 0 1 1.06.44L7.95 3.9h5a1.5 1.5 0 0 1 1.5 1.5v6.6a1.5 1.5 0 0 1-1.5 1.5H3.1A1.5 1.5 0 0 1 1.6 12z"
    />
    {#if isOpen}
      <path
        class="front"
        d="M3.15 7.35A1.2 1.2 0 0 1 4.3 6.5h10.05a.8.8 0 0 1 .76 1.04l-1.38 4.75a1.5 1.5 0 0 1-1.44 1.08H2.3a.8.8 0 0 1-.76-1.04z"
      />
    {:else}
      <path
        class="front"
        d="M1.6 6.3A1.3 1.3 0 0 1 2.9 5h10.25a1.3 1.3 0 0 1 1.3 1.3V12a1.5 1.5 0 0 1-1.5 1.5H3.1A1.5 1.5 0 0 1 1.6 12z"
      />
    {/if}
  </svg>
  {#if icon !== null}
    <span class="emblem" class:open={isOpen}>
      <FolderIconGlyph {icon} size={7} />
    </span>
  {/if}
</span>

<style>
  .folder {
    position: relative;
    display: block;
    flex: none;
    width: 16px;
    height: 16px;
  }

  svg {
    display: block;
    overflow: visible;
  }

  path {
    stroke: var(--folder-line);
    stroke-width: 1.1;
    stroke-linejoin: round;
  }

  .back {
    fill: var(--folder-tab);
  }

  .front {
    fill: var(--folder-fill);
  }

  .emblem {
    position: absolute;
    top: 5.75px;
    left: 4.5px;
    color: var(--folder-line);
  }

  .emblem.open {
    top: 6.1px;
    left: 4.9px;
  }
</style>
