<script lang="ts">
  import type { LiveItemView } from "#protocol"
  import { faviconLetter } from "../logic/favicon"
  import { hasSavedFavicon } from "../state/saved-favicons"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"

  interface Props {
    item: LiveItemView
  }

  const { item }: Props = $props()
  const ctx = getSidebarContext()

  let isImageBroken = $state(false)
  let isSiteFaviconSaved = $state(false)

  $effect(() => {
    const icon = item.icon
    isSiteFaviconSaved = false
    if (icon?._tag !== "SiteFavicon") return
    let isCurrent = true
    void hasSavedFavicon(icon.siteUrl, ctx.faviconUrl).then((saved) => {
      if (isCurrent) isSiteFaviconSaved = saved
    })
    return () => {
      isCurrent = false
    }
  })

  const initial = $derived(faviconLetter("", item.subtitle === "" ? item.title : item.subtitle))
</script>

{#if item.icon?._tag === "Image" && !isImageBroken}
  <img
    class="avatar"
    src={item.icon.url}
    alt=""
    width="16"
    height="16"
    draggable="false"
    onerror={() => (isImageBroken = true)}
  />
{:else if item.icon?._tag === "SiteFavicon" && isSiteFaviconSaved}
  <Favicon pageUrl={item.icon.siteUrl} favIconUrl={null} title={item.subtitle} />
{:else}
  <span class="initial" aria-hidden="true">{initial}</span>
{/if}

<style>
  .avatar {
    display: block;
    flex: none;
    border-radius: 50%;
  }

  .initial {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: color-mix(in srgb, currentColor 16%, transparent);
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1;
  }
</style>
