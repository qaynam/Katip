<script lang="ts" module>
  const paths = {
    plus: "M8 3.25v9.5M3.25 8h9.5",
    close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
    more: "M8 3.6h.01M8 8h.01M8 12.4h.01",
    archive:
      "M2.75 3.25h10.5v2.5H2.75zM3.75 5.75v6.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-6.5M6.5 8.5h3",
    folder:
      "M2.25 4.75a1 1 0 0 1 1-1h2.9l1.4 1.5h5.2a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1z",
    folderOpen:
      "M2.25 11.25v-6.5a1 1 0 0 1 1-1h2.9l1.4 1.5h4.2a1 1 0 0 1 1 1v.75M2.25 11.25l1.5-3.6a1 1 0 0 1 .92-.65h8.83a.6.6 0 0 1 .56.82l-1.3 3.4a1 1 0 0 1-.93.64H3.25a1 1 0 0 1-1-1z",
    chevronRight: "M6.25 4l4 4-4 4",
    chevronLeft: "M9.75 4l-4 4 4 4",
    undo: "M5.5 3.75L2.75 6.5 5.5 9.25M2.75 6.5h6.5a3.5 3.5 0 0 1 0 7H7.5",
    speaker: "M2.75 6.25h2l3-2.5v8.5l-3-2.5h-2zM10.25 6a2.8 2.8 0 0 1 0 4M11.9 4.4a5 5 0 0 1 0 7.2",
    speakerMuted: "M2.75 6.25h2l3-2.5v8.5l-3-2.5h-2zM10.5 6.25l3.25 3.5M13.75 6.25l-3.25 3.5",
    check: "M3.5 8.25l2.75 2.75 6.25-6.5",
    restore: "M3 8a5 5 0 1 0 1.46-3.54M3 3.5v2.25h2.25",
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
  stroke-width={name === "more" ? 2.6 : 1.5}
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
