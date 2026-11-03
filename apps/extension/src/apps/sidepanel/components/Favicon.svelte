<script lang="ts">
  import { faviconCandidates, faviconLetter } from "../logic/favicon"
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
