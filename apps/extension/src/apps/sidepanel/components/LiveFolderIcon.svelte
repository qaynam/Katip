<script lang="ts">
  import type { LiveSource } from "#modules/live-folders"
  import { liveSourceNames, liveSourceSiteUrl } from "../logic/live-folders"
  import Favicon from "./Favicon.svelte"

  interface Props {
    source: LiveSource
  }

  const { source }: Props = $props()
</script>

<span class="live-icon">
  <Favicon
    pageUrl={liveSourceSiteUrl(source)}
    favIconUrl={null}
    title={liveSourceNames[source._tag]}
  />
  <!-- Not a red dot: on an app's icon that reads as unread mail, even with nothing unread -->
  <span class="live-mark" aria-hidden="true">
    <svg width="8" height="8" viewBox="0 0 8 8">
      <circle cx="1.75" cy="6.25" r="1.15" />
      <path d="M1 3.6a3.4 3.4 0 0 1 3.4 3.4M1 1.05A5.95 5.95 0 0 1 6.95 7" />
    </svg>
  </span>
</span>

<style>
  .live-icon {
    position: relative;
    display: block;
    flex: none;
    width: 16px;
    height: 16px;
  }

  .live-mark {
    position: absolute;
    right: -3px;
    bottom: -3px;
    display: grid;
    place-items: center;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--surface-active);
    box-shadow: 0 0 0 1px var(--divider);
    color: var(--text);
  }

  .live-mark svg {
    display: block;
    overflow: visible;
  }

  .live-mark circle {
    fill: currentColor;
  }

  .live-mark path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
  }
</style>
