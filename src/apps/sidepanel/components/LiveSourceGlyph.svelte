<script lang="ts">
  import type { LiveSourceKind } from "../logic/live-folders"

  interface Props {
    kind: LiveSourceKind
  }

  const { kind }: Props = $props()
</script>

<svg
  class="glyph"
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if kind === "Gmail"}
    <rect x="2" y="3.75" width="12" height="8.5" rx="1.5" />
    <path d="M2.5 4.5L8 8.75l5.5-4.25" />
  {:else}
    <circle cx="4.5" cy="3.75" r="1.5" />
    <circle cx="4.5" cy="12.25" r="1.5" />
    <circle cx="11.5" cy="12.25" r="1.5" />
    <path d="M4.5 5.25v5.5M11.5 10.75v-4.5a2 2 0 0 0-2-2H7.25M8.75 2.5L7.25 4.25 8.75 6" />
  {/if}
</svg>

<style>
  .glyph {
    display: block;
    flex: none;
  }
</style>
