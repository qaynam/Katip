<script lang="ts" module>
  // The flap is drawn with the same commands open and closed, so CSS can move one shape into the
  // other point by point as the folder opens
  const CLOSED_FLAP =
    "M1.6 6.3A1.3 1.3 0 0 1 2.9 5L13.15 5A1.3 1.3 0 0 1 14.45 6.3L14.45 12A1.5 1.5 0 0 1 12.95 13.5L3.1 13.5A1.5 1.5 0 0 1 1.6 12Z"
  const OPEN_FLAP =
    "M3.15 7.35A1.2 1.2 0 0 1 4.3 6.5L14.35 6.5A.8.8 0 0 1 15.11 7.54L13.73 12.29A1.5 1.5 0 0 1 12.29 13.37L2.3 13.37A.8.8 0 0 1 1.54 12.33Z"
</script>

<script lang="ts">
  import type { FolderIcon } from "#modules/pinned"
  import { DISCLOSURE_DURATION_MS, SPRING_EASING_CSS } from "./disclose"
  import FolderIconGlyph from "./FolderIconGlyph.svelte"

  interface Props {
    isOpen: boolean
    /** The icon chosen for the folder, drawn inside it. */
    icon?: FolderIcon | null
  }

  const { isOpen, icon = null }: Props = $props()
</script>

<span
  class="folder"
  class:open={isOpen}
  data-folder-glyph={isOpen ? "open" : "closed"}
  style:--closed-flap="path('{CLOSED_FLAP}')"
  style:--open-flap="path('{OPEN_FLAP}')"
  style:--duration="{DISCLOSURE_DURATION_MS}ms"
  style:--easing={SPRING_EASING_CSS}
>
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      class="back"
      d="M1.6 3.9A1.5 1.5 0 0 1 3.1 2.4h2.75a1.5 1.5 0 0 1 1.06.44L7.95 3.9h5a1.5 1.5 0 0 1 1.5 1.5v6.6a1.5 1.5 0 0 1-1.5 1.5H3.1A1.5 1.5 0 0 1 1.6 12z"
    />
    <path class="front" d={isOpen ? OPEN_FLAP : CLOSED_FLAP} />
  </svg>
  {#if icon !== null}
    <span class="emblem">
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

  /* On the same spring as the contents' slide, so the flap and the rows move as one */
  .front {
    d: var(--closed-flap);
    fill: var(--folder-fill);
    transition: d var(--duration) var(--easing);
  }

  .open .front {
    d: var(--open-flap);
  }

  .emblem {
    position: absolute;
    top: 5.75px;
    left: 4.5px;
    color: var(--folder-line);
    transition: transform var(--duration) var(--easing);
  }

  .open .emblem {
    transform: translate(0.4px, 0.35px);
  }

  @media (prefers-reduced-motion: reduce) {
    .front,
    .emblem {
      transition: none;
    }
  }
</style>
