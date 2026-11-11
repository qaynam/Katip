<script lang="ts" module>
  import type { ActionGlyph } from "../logic/action-glyph"

  // Drawn on the 16px grid and stroke of the side panel's icons, so commands sit in their tiles the
  // way favicons do
  const paths: Readonly<Record<ActionGlyph, string>> = {
    link: "M6.6 9.4l2.8-2.8M7.3 4.5l.9-.9a2.6 2.6 0 0 1 3.7 3.7l-.9.9M8.7 11.5l-.9.9a2.6 2.6 0 0 1-3.7-3.7l.9-.9",
    markdown:
      "M2.5 3.75h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1zM4 10.25v-4.5l1.75 2.25 1.75-2.25v4.5M11.25 5.75v4.5M9.75 8.75l1.5 1.5 1.5-1.5",
    pin: "M5.5 2.75h5M6.5 2.75v3.5L4.75 8.5v.75h6.5V8.5L9.5 6.25v-3.5M8 9.25v4",
    duplicate:
      "M6.25 5.75h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM10.75 5.75v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5",
    split:
      "M2.5 3.75h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1zM8 3.75v8.5",
    close:
      "M3.75 2.75h8.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM6.25 6.25l3.5 3.5M9.75 6.25l-3.5 3.5",
    speaker:
      "M2.75 6.25H5L8 3.75v8.5L5 9.75H2.75zM10.5 6a2.8 2.8 0 0 1 0 4M12.25 4.25a5.3 5.3 0 0 1 0 7.5",
    move: "M9.75 2.75h2.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-2.5M2.75 8h7.5M7.5 5.25L10.25 8 7.5 10.75",
    sweep: "M2.75 4h10.5M2.75 8h5.5M2.75 12h4M10.25 9.5l3 3M13.25 9.5l-3 3",
    settings: "M2.75 5h6M12.25 5h1M2.75 11h1M7.25 11h6M10.75 3.25v3.5M5.5 9.25v3.5",
  }
</script>

<script lang="ts">
  interface Props {
    glyph: ActionGlyph
    size?: number
  }

  const { glyph, size = 16 }: Props = $props()
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
  data-glyph={glyph}
>
  <path d={paths[glyph]} />
</svg>

<style>
  .glyph {
    display: block;
    flex: none;
  }
</style>
