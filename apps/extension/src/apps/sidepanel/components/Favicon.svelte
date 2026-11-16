<script lang="ts">
  import {
    faviconCandidates,
    faviconLetter,
    toneSampleUrl,
    type FaviconTone,
  } from "../logic/favicon"
  import { faviconToneAt } from "../state/favicon-tones"
  import { getSidebarContext } from "../state/sidebar-context"

  interface Props {
    pageUrl: string
    favIconUrl: string | null
    title: string
    size?: number
  }

  const { pageUrl, favIconUrl, title, size = 16 }: Props = $props()
  const ctx = getSidebarContext()

  let failed = $state.raw<ReadonlySet<string>>(new Set())
  const candidates = $derived(faviconCandidates(pageUrl, favIconUrl, ctx.faviconUrl))
  const source = $derived(candidates.find((candidate) => !failed.has(candidate)))

  const skip = (candidate: string) => {
    failed = new Set([...failed, candidate])
  }

  let tone = $state<FaviconTone>("Mixed")
  const sampleUrl = $derived(
    source === undefined ? null : toneSampleUrl(source, pageUrl, ctx.faviconUrl),
  )
  $effect(() => {
    const url = sampleUrl
    tone = "Mixed"
    if (url === null) return
    let isCurrent = true
    void faviconToneAt(url).then((found) => {
      if (isCurrent) tone = found
    })
    return () => {
      isCurrent = false
    }
  })
</script>

{#if source === undefined}
  <span class="letter" style:--size="{size}px" aria-hidden="true">
    {faviconLetter(pageUrl, title)}
  </span>
{:else}
  <img
    class="image"
    src={source}
    alt=""
    width={size}
    height={size}
    data-tone={tone}
    draggable="false"
    onerror={() => skip(source)}
  />
{/if}

<style>
  .image {
    display: block;
    flex: none;
    border-radius: 3px;
  }

  /* Not left as the site drew it: a site switching its icon with the system's scheme draws it in
     one color, which vanishes into a Space theme of the same lightness */
  :global(.katip-root[data-scheme="light"]) .image[data-tone="Light"],
  :global(.katip-root[data-scheme="dark"]) .image[data-tone="Dark"] {
    filter: invert(1);
  }

  .letter {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 4px;
    background: color-mix(in srgb, currentColor 16%, transparent);
    font-size: calc(var(--size) * 0.62);
    font-weight: 700;
    line-height: 1;
  }
</style>
