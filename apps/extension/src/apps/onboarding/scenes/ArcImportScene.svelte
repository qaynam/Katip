<script lang="ts">
  import Stage from "../components/Stage.svelte"

  const ROWS = 5
</script>

<Stage glow="personal">
  <div class="scene">
    <div class="sidebar from">
      {#each { length: ROWS }, index (index)}
        <span class="row" style:--index={index}><i></i><b style:width="{75 - index * 9}%"></b></span
        >
      {/each}
    </div>
    <span class="arrow"></span>
    <div class="sidebar to">
      <img class="badge" src="/icons/icon-32.png" alt="" />
      {#each { length: ROWS }, index (index)}
        <span class="row" style:--index={index}><i></i><b style:width="{75 - index * 9}%"></b></span
        >
      {/each}
    </div>
  </div>
</Stage>

<style>
  .scene {
    display: flex;
    align-items: center;
    gap: 8cqh;
  }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3cqh;
    width: 46cqh;
    height: 70cqh;
    padding: 6cqh 4cqh;
    box-sizing: border-box;
    border-radius: 4cqh;
    box-shadow: var(--window-shadow);
  }

  .from {
    background: linear-gradient(160deg, #f6b3c8, #c9b5f5);
  }

  .to {
    background: color-mix(in srgb, #86b3f5 28%, var(--surface));
  }

  .badge {
    position: absolute;
    top: -3cqh;
    right: -3cqh;
    width: 9cqh;
    height: 9cqh;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 2.4cqh;
    height: 6cqh;
  }

  .row i {
    flex: none;
    width: 4cqh;
    height: 4cqh;
    border-radius: 1.2cqh;
    background: rgb(255 255 255 / 0.75);
  }

  .to .row i {
    background: color-mix(in srgb, var(--ink) 25%, transparent);
  }

  .row b {
    height: 1.8cqh;
    border-radius: 1cqh;
    background: rgb(255 255 255 / 0.7);
  }

  .to .row b {
    background: color-mix(in srgb, var(--ink) 20%, transparent);
  }

  .from .row {
    opacity: 0.35;
    animation: leave 5s ease infinite;
    animation-delay: calc(var(--index) * 0.35s);
  }

  .to .row {
    animation: arrive 5s ease infinite;
    animation-delay: calc(var(--index) * 0.35s);
  }

  .arrow {
    width: 10cqh;
    height: 10cqh;
    border-top: 1.4cqh solid var(--accent);
    border-right: 1.4cqh solid var(--accent);
    border-radius: 0.8cqh;
    rotate: 45deg;
    animation: nudge 1.6s ease-in-out infinite;
  }

  @keyframes leave {
    0%,
    10% {
      opacity: 1;
      translate: 0 0;
    }
    25%,
    85% {
      opacity: 0.35;
      translate: 2cqh 0;
    }
    100% {
      opacity: 1;
      translate: 0 0;
    }
  }

  @keyframes arrive {
    0%,
    15% {
      opacity: 0;
      translate: -3cqh 0;
    }
    30%,
    85% {
      opacity: 1;
      translate: 0 0;
    }
    100% {
      opacity: 0;
      translate: -3cqh 0;
    }
  }

  @keyframes nudge {
    0%,
    100% {
      translate: -1cqh 1cqh;
    }
    50% {
      translate: 1cqh -1cqh;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .from .row,
    .to .row,
    .arrow {
      animation: none;
    }
  }
</style>
