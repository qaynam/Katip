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
  <span class="live-mark" aria-hidden="true"></span>
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
    right: -2px;
    bottom: -2px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff3b30;
    box-shadow: 0 0 0 1.5px var(--surface-active);
  }

  :global(.katip-root[data-scheme="dark"]) .live-mark {
    background: #ff453a;
  }
</style>
