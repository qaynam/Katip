<script lang="ts">
  interface Props {
    size?: number
  }

  const { size = 16 }: Props = $props()
</script>

<svg
  class="glyph"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  aria-hidden="true"
>
  <circle cx="7" cy="7" r="4.25" />
  <path d="M10.2 10.2l3.05 3.05" />
</svg>

<style>
  .glyph {
    display: block;
    flex: none;
  }
</style>
