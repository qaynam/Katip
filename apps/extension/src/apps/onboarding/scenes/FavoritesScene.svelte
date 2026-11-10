<script lang="ts">
  import Stage from "../components/Stage.svelte"

  const FAVORITE_COLORS = ["#f28b6b", "#4f8cf0", "#36b37e"]
  const ROWS = 5
  // The row that moves into the empty Favorites tile
  const MOVING_ROW = 2
</script>

<Stage>
  <div class="sidebar">
    <div class="favorites">
      {#each FAVORITE_COLORS as color (color)}
        <span class="tile"><i style:background={color}></i></span>
      {/each}
      <span class="tile empty"><i class="arrived"></i></span>
    </div>
    {#each { length: ROWS }, index (index)}
      <span class="row" class:moving={index === MOVING_ROW}
        ><i></i><b style:width="{78 - index * 10}%"></b></span
      >
    {/each}
    <span class="ghost"><i></i><b></b></span>
  </div>
</Stage>

<style>
  /* Measured in cqh: the sidebar is 56 wide with a padding of 4, the tiles 10.5 wide with gaps of 2,
     and the rows 7 high with gaps of 2, starting 16 from the top */
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2cqh;
    width: 56cqh;
    height: 84cqh;
    padding: 4cqh;
    box-sizing: border-box;
    border-radius: 4cqh;
    background: color-mix(in srgb, #86b3f5 28%, var(--surface));
    box-shadow: var(--window-shadow);
  }

  .favorites {
    display: grid;
    grid-template-columns: repeat(4, 10.5cqh);
    gap: 2cqh;
    margin-bottom: 2cqh;
  }

  .tile {
    display: grid;
    place-items: center;
    height: 8cqh;
    border-radius: 2cqh;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
  }

  .tile i {
    width: 3.6cqh;
    height: 3.6cqh;
    border-radius: 1cqh;
  }

  .empty {
    outline: 0.4cqh dashed color-mix(in srgb, var(--ink) 25%, transparent);
    outline-offset: -0.4cqh;
  }

  .arrived {
    background: #9b6bf2;
    animation: arrive 6s ease infinite;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 2.4cqh;
    height: 7cqh;
    padding: 0 1.6cqh;
    border-radius: 1.6cqh;
  }

  .row i,
  .ghost i {
    flex: none;
    width: 3.6cqh;
    height: 3.6cqh;
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 25%, transparent);
  }

  .row b,
  .ghost b {
    height: 1.8cqh;
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 20%, transparent);
  }

  .moving {
    opacity: 0;
    animation: lift 6s ease infinite;
  }

  .ghost {
    position: absolute;
    top: 4cqh;
    left: 41.5cqh;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2.4cqh;
    width: 10.5cqh;
    height: 8cqh;
    box-sizing: border-box;
    border-radius: 2cqh;
    background: var(--surface);
    box-shadow: 0 1.5cqh 4cqh rgb(0 0 0 / 0.16);
    opacity: 0;
    animation: carry 6s ease infinite;
  }

  .ghost i {
    background: #9b6bf2;
  }

  .ghost b {
    flex: 1;
    animation: shrink 6s ease infinite;
  }

  @keyframes lift {
    0%,
    15% {
      opacity: 1;
    }
    18%,
    85% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes carry {
    0%,
    15% {
      top: 34cqh;
      left: 4cqh;
      width: 48cqh;
      height: 7cqh;
      opacity: 0;
    }
    18% {
      top: 33cqh;
      left: 4cqh;
      width: 48cqh;
      height: 7cqh;
      opacity: 1;
    }
    45% {
      top: 4cqh;
      left: 41.5cqh;
      width: 10.5cqh;
      height: 8cqh;
      opacity: 1;
    }
    50%,
    100% {
      top: 4cqh;
      left: 41.5cqh;
      width: 10.5cqh;
      height: 8cqh;
      opacity: 0;
    }
  }

  @keyframes shrink {
    0%,
    18% {
      max-width: 30cqh;
      opacity: 1;
    }
    40%,
    100% {
      max-width: 0;
      opacity: 0;
    }
  }

  @keyframes arrive {
    0%,
    46% {
      opacity: 0;
      scale: 0.6;
    }
    52%,
    88% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
      scale: 0.6;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ghost,
    .ghost b,
    .arrived {
      animation: none;
    }

    /* Shown as already moved into Favorites */
    .moving {
      display: none;
    }
  }
</style>
