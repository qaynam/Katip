<script lang="ts">
  import type { Download } from "../logic/downloads"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  interface Props {
    download: Download
  }

  const ICON_SIZE = 20

  const { download }: Props = $props()
  const ctx = getSidebarContext()

  // Read through deriveds so that progress moving on doesn't fetch the icon again. A finished
  // file's icon may differ from the one shown while it downloads, so a new stage does
  const downloadId = $derived(download.id)
  const stage = $derived(download.progress._tag)

  let icon = $state<string | null>(null)
  $effect(() => {
    void stage
    let isCurrent = true
    void ctx.downloads.fileIcon(downloadId).then((found) => {
      if (isCurrent && found !== null) icon = found
    })
    return () => {
      isCurrent = false
    }
  })
</script>

{#if icon === null}
  <span class="generic"><Icon name="file" size={ICON_SIZE} /></span>
{:else}
  <img class="image" src={icon} alt="" width={ICON_SIZE} height={ICON_SIZE} draggable="false" />
{/if}

<style>
  .generic {
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    color: var(--text);
  }

  .image {
    display: block;
    flex: none;
  }
</style>
