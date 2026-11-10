<script lang="ts">
  import MiniSidebar from "../components/MiniSidebar.svelte"
  import Stage from "../components/Stage.svelte"
</script>

<Stage glow="personal">
  <div class="scene">
    <div class="sidebar"><MiniSidebar rows={8} tint="transparent" /></div>
    <div class="picker">
      <div class="field"><span class="dot"></span></div>
    </div>
  </div>
</Stage>

<style>
  .scene {
    display: flex;
    align-items: center;
    gap: 7cqh;
  }

  .sidebar {
    width: 42cqh;
    height: 76cqh;
    overflow: hidden;
    border-radius: 4cqh;
    background: color-mix(in srgb, #4f8cf0 30%, var(--surface));
    box-shadow: var(--window-shadow);
    animation: tint 8s ease infinite;
  }

  .picker {
    padding: 3cqh;
    border-radius: 4cqh;
    background: var(--surface);
    box-shadow: var(--window-shadow);
  }

  /* Vivid at the top, paling toward white at the bottom, like the theme picker in the side panel */
  .field {
    position: relative;
    width: 66cqh;
    height: 46cqh;
    border-radius: 2.4cqh;
    background:
      linear-gradient(to bottom, transparent, #ffffff),
      linear-gradient(
        to right,
        #ff5e57,
        #ffa94d,
        #ffe066,
        #51cf66,
        #22b8cf,
        #4f8cf0,
        #845ef7,
        #f06595
      );
  }

  .dot {
    position: absolute;
    top: 35%;
    left: 70%;
    width: 5cqh;
    height: 5cqh;
    border: 0.8cqh solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0.5cqh 1.5cqh rgb(0 0 0 / 0.3);
    translate: -50% -50%;
    animation: move 8s ease infinite;
  }

  @keyframes move {
    0%,
    20% {
      top: 35%;
      left: 70%;
    }
    25%,
    45% {
      top: 40%;
      left: 88%;
    }
    50%,
    70% {
      top: 45%;
      left: 6%;
    }
    75%,
    95% {
      top: 38%;
      left: 40%;
    }
    100% {
      top: 35%;
      left: 70%;
    }
  }

  @keyframes tint {
    0%,
    20% {
      background: color-mix(in srgb, #4f8cf0 30%, var(--surface));
    }
    25%,
    45% {
      background: color-mix(in srgb, #f06595 30%, var(--surface));
    }
    50%,
    70% {
      background: color-mix(in srgb, #ff5e57 30%, var(--surface));
    }
    75%,
    95% {
      background: color-mix(in srgb, #51cf66 30%, var(--surface));
    }
    100% {
      background: color-mix(in srgb, #4f8cf0 30%, var(--surface));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .dot {
      animation: none;
    }
  }
</style>
