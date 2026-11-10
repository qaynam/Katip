<script lang="ts">
  import Keys from "../components/Keys.svelte"
  import Stage from "../components/Stage.svelte"

  /** The keys that open the side panel, as the browser shows them. */
  let { shortcut }: { shortcut: string } = $props()
</script>

<Stage short>
  <div class="scene">
    <Keys {shortcut} large />
  </div>
</Stage>

<style>
  .scene {
    font-size: 15cqh;
  }

  .scene :global(.cap) {
    min-width: 2.2em;
    height: 2.2em;
    border-radius: 0.4em;
    box-shadow:
      0 0 0 1px var(--hairline),
      0 0.12em 0 color-mix(in srgb, var(--ink) 16%, transparent),
      0 0.4em 1em rgb(0 0 0 / 0.08);
    font-size: 1em;
    animation: press 3.6s ease infinite;
    animation-delay: calc(var(--index) * 140ms);
  }

  @keyframes press {
    0%,
    30%,
    70%,
    100% {
      translate: 0 0;
      box-shadow:
        0 0 0 1px var(--hairline),
        0 0.12em 0 color-mix(in srgb, var(--ink) 16%, transparent),
        0 0.4em 1em rgb(0 0 0 / 0.08);
    }
    40%,
    60% {
      translate: 0 0.1em;
      box-shadow:
        0 0 0 1px var(--hairline),
        0 0.02em 0 color-mix(in srgb, var(--ink) 16%, transparent),
        0 0.15em 0.4em rgb(0 0 0 / 0.06);
      color: var(--accent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene :global(.cap) {
      animation: none;
    }
  }
</style>
