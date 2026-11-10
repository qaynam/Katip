<script lang="ts">
  import Stage from "../components/Stage.svelte"
</script>

<Stage>
  <svg class="check" viewBox="0 0 52 52">
    <circle class="ring" cx="26" cy="26" r="24" />
    <path class="mark" d="M15 27 l7 7 l15 -16" />
  </svg>
</Stage>

<style>
  /* On the svg rather than the circle: inside, the shadow would be cut off at the viewBox */
  .check {
    width: 44cqh;
    height: 44cqh;
    filter: drop-shadow(0 6px 14px rgb(31 116 240 / 0.25));
  }

  .ring {
    fill: var(--surface);
    stroke: var(--button);
    stroke-width: 2.5;
  }

  .mark {
    fill: none;
    stroke: var(--button);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 40;
    animation: draw 900ms ease 200ms both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 40;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mark {
      animation: none;
    }
  }
</style>
