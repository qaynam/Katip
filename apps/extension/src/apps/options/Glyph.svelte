<script lang="ts" module>
  // Drawn on the side panel's 16px grid with the same stroke, so the categories sit in their rows
  // the way favicons sit in tab rows
  const paths = {
    sliders: "M2.75 5h6M12.25 5h1M2.75 11h1M7.25 11h6M10.75 3.25v3.5M5.5 9.25v3.5",
    tabs: "M3.5 2.75h9a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1zM3.25 9.5h9.5M3.25 12.75h6.5",
    archive:
      "M2.75 3.25h10.5v2.5H2.75zM3.75 5.75v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-6.5M6.5 8.5h3",
    search: "M7.1 2.75a4.35 4.35 0 1 1 0 8.7 4.35 4.35 0 0 1 0-8.7zM10.25 10.25l3 3",
    command:
      "M6 6h4v4H6zM6 6V4.6A1.6 1.6 0 1 0 4.6 6H6M10 6V4.6A1.6 1.6 0 1 1 11.4 6H10M10 10v1.4a1.6 1.6 0 1 0 1.4-1.4H10M6 10v1.4A1.6 1.6 0 1 1 4.6 10H6",
    export: "M8 2.75v7M5.25 7.25L8 10l2.75-2.75M2.75 10.25v2a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1v-2",
    external:
      "M6.5 3.25H4a1.25 1.25 0 0 0-1.25 1.25V12A1.25 1.25 0 0 0 4 13.25h7.5A1.25 1.25 0 0 0 12.75 12V9.5M9.25 2.75h4v4M13 3l-5.5 5.5",
  } as const

  export type GlyphName = keyof typeof paths
</script>

<script lang="ts">
  let { name, size = 16 }: { name: GlyphName; size?: number } = $props()
</script>

<svg
  class="glyph"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>

<style>
  .glyph {
    display: block;
    flex: none;
  }
</style>
