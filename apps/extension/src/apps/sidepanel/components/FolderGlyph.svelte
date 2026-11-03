<script lang="ts">
  interface Props {
    isOpen: boolean
  }

  const { isOpen }: Props = $props()
</script>

<svg class="folder" width="17" height="16" viewBox="0 0 17 16" aria-hidden="true">
  <path
    class="back"
    d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3.1l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z"
  />
  {#if isOpen}
    <path
      class="front"
      d="M3.1 7.2a1.2 1.2 0 0 1 1.1-.8h11.1a.7.7 0 0 1 .66.92l-1.62 5.2a1.4 1.4 0 0 1-1.34.98H2.4a.7.7 0 0 1-.66-.92z"
    />
  {:else}
    <path
      class="front"
      d="M1.5 6.6A1.1 1.1 0 0 1 2.6 5.5h10.8a1.1 1.1 0 0 1 1.1 1.1V12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12z"
    />
  {/if}
</svg>

<style>
  .folder {
    display: block;
    flex: none;
    overflow: visible;
  }

  .back {
    fill: color-mix(in srgb, var(--accent) 62%, #000);
  }

  .front {
    fill: var(--accent);
  }
</style>
