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
  stroke-width="1.4"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path
    d="M6 6h4v4H6zM6 6V4.6A1.6 1.6 0 1 0 4.6 6H6M10 6V4.6A1.6 1.6 0 1 1 11.4 6H10M10 10v1.4a1.6 1.6 0 1 0 1.4-1.4H10M6 10v1.4A1.6 1.6 0 1 1 4.6 10H6"
  />
</svg>

<style>
  .glyph {
    display: block;
    flex: none;
  }
</style>
