<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    glow = "work",
    short = false,
    children,
  }: {
    /** Which pair of Space colors glows behind the picture, as on Katip's website. */
    glow?: "work" | "personal"
    /** For a step with much to read below the picture, so that the step still fits the window. */
    short?: boolean
    children: Snippet
  } = $props()
</script>

<div class="stage {glow}" class:short aria-hidden="true">
  {@render children()}
</div>

<style>
  .stage {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    aspect-ratio: 21 / 9;
    overflow: hidden;
    /* The pictures are measured in cqh, a hundredth of the stage's height, so they scale with it */
    container-type: size;
    border-radius: 18px;
    background: var(--stage);
  }

  .short {
    aspect-ratio: 32 / 9;
  }

  .stage::before {
    content: "";
    position: absolute;
    inset: 10% 5%;
    z-index: -1;
    background:
      radial-gradient(55% 65% at 25% 55%, var(--glow-a), transparent 72%),
      radial-gradient(55% 65% at 75% 50%, var(--glow-b), transparent 72%);
    filter: blur(40px);
    opacity: var(--glow-strength);
  }

  .work {
    --glow-a: #86b3f5;
    --glow-b: #b4a9f2;
  }

  .personal {
    --glow-a: #f7a184;
    --glow-b: #ee9cc2;
  }
</style>
