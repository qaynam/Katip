<script lang="ts">
  import Stage from "../components/Stage.svelte"

  const ITEMS = 3
</script>

<Stage>
  <div class="sidebar">
    <span class="row muted"><i></i><b style:width="60%"></b></span>
    <span class="row folder">
      <span class="spinner"></span>
      <b style:width="46%"></b>
      <span class="badge">
        {#each { length: ITEMS }, index (index)}
          <span class="count" style:--index={index}>{index + 1}</span>
        {/each}
      </span>
    </span>
    {#each { length: ITEMS }, index (index)}
      <span class="row item" style:--index={index}
        ><span class="new"></span><i></i><b style:width="{70 - index * 12}%"></b></span
      >
    {/each}
    <span class="row muted"><i></i><b style:width="52%"></b></span>
    <span class="row muted"><i></i><b style:width="66%"></b></span>
  </div>
</Stage>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 2cqh;
    width: 60cqh;
    height: 84cqh;
    padding: 5cqh 4cqh;
    box-sizing: border-box;
    border-radius: 4cqh;
    background: color-mix(in srgb, #86b3f5 28%, var(--surface));
    box-shadow: var(--window-shadow);
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2.4cqh;
    height: 7cqh;
    padding: 0 1.6cqh;
    border-radius: 1.6cqh;
  }

  .row i {
    flex: none;
    width: 3.6cqh;
    height: 3.6cqh;
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 25%, transparent);
  }

  .row b {
    height: 1.8cqh;
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 20%, transparent);
  }

  .muted {
    opacity: 0.55;
  }

  .folder {
    background: color-mix(in srgb, var(--surface) 70%, transparent);
  }

  .folder b {
    background: color-mix(in srgb, var(--ink) 40%, transparent);
  }

  .spinner {
    flex: none;
    width: 3.6cqh;
    height: 3.6cqh;
    box-sizing: border-box;
    border: 0.6cqh solid color-mix(in srgb, var(--ink) 25%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 6s linear infinite;
  }

  .badge {
    position: relative;
    display: grid;
    margin-left: auto;
  }

  .count {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    min-width: 4cqh;
    height: 4cqh;
    padding: 0 1cqh;
    border-radius: 2cqh;
    background: var(--accent);
    color: #ffffff;
    font-size: 2.6cqh;
    font-weight: 600;
    opacity: 0;
    animation: count 6s ease infinite;
    animation-delay: calc(var(--index) * 0.8s);
  }

  .count:last-child {
    opacity: 1;
  }

  .item {
    padding-left: 5cqh;
    animation: appear 6s ease infinite;
    animation-delay: calc(var(--index) * 0.8s);
  }

  .new {
    position: absolute;
    left: 1.6cqh;
    width: 1.6cqh;
    height: 1.6cqh;
    border-radius: 50%;
    background: var(--accent);
  }

  @keyframes spin {
    0% {
      rotate: 0deg;
    }
    20%,
    100% {
      rotate: 720deg;
    }
  }

  @keyframes appear {
    0%,
    15% {
      opacity: 0;
      translate: 0 -2cqh;
    }
    22%,
    88% {
      opacity: 1;
      translate: 0 0;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes count {
    0%,
    15% {
      opacity: 0;
      scale: 0.6;
    }
    20%,
    32% {
      opacity: 1;
      scale: 1;
    }
    36%,
    100% {
      opacity: 0;
    }
  }

  .count:last-child {
    animation-name: count-last;
  }

  @keyframes count-last {
    0%,
    15% {
      opacity: 0;
      scale: 0.6;
    }
    20%,
    88% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner,
    .count,
    .item {
      animation: none;
    }
  }
</style>
