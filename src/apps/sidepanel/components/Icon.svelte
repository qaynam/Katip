<script lang="ts" module>
  const paths = {
    plus: "M8 3.25v9.5M3.25 8h9.5",
    minus: "M3.25 8h9.5",
    close: "M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5",
    more: "M3.6 8h.01M8 8h.01M12.4 8h.01",
    archive:
      "M2.75 3.25h10.5v2.5H2.75zM3.75 5.75v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-6.5M6.5 8.5h3",
    arrowDown: "M8 3.5v8.5M4.75 8.75L8 12l3.25-3.25",
    chevronRight: "M6.25 4l4 4-4 4",
    chevronLeft: "M9.75 4l-4 4 4 4",
    undo: "M5.5 3.75L2.75 6.5 5.5 9.25M2.75 6.5h6.5a3.5 3.5 0 0 1 0 7H7.5",
    speaker: "M2.75 6.25h2l3-2.5v8.5l-3-2.5h-2zM10.25 6a2.8 2.8 0 0 1 0 4M11.9 4.4a5 5 0 0 1 0 7.2",
    speakerMuted: "M2.75 6.25h2l3-2.5v8.5l-3-2.5h-2zM10.5 6.25l3.25 3.5M13.75 6.25l-3.25 3.5",
    sparkles:
      "M7 2.75l1.05 3.2 3.2 1.05-3.2 1.05L7 11.25 5.95 8.05 2.75 7l3.2-1.05zM12 9.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z",
    sun: "M8 5.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM8 1.9v1.3M8 12.8v1.3M1.9 8h1.3M12.8 8h1.3M3.7 3.7l.9.9M11.4 11.4l.9.9M3.7 12.3l.9-.9M11.4 4.6l.9-.9",
    moon: "M12.9 9.6A5.25 5.25 0 1 1 6.4 3.1a4.25 4.25 0 0 0 6.5 6.5z",
    search: "M7.1 2.75a4.35 4.35 0 1 1 0 8.7 4.35 4.35 0 0 1 0-8.7zM10.25 10.25l3 3",
    alert: "M8 2.75l5.75 10H2.25zM8 6.75v2.75M8 11.25h.01",
  } as const

  export type IconName = keyof typeof paths
</script>

<script lang="ts">
  interface Props {
    name: IconName
    size?: number
  }

  const { name, size = 16 }: Props = $props()
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width={name === "more" ? 2.4 : 1.4}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
