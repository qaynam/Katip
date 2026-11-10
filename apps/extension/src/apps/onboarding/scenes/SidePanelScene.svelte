<script lang="ts">
  import MiniSidebar from "../components/MiniSidebar.svelte"
  import MiniWindow from "../components/MiniWindow.svelte"
  import Stage from "../components/Stage.svelte"
</script>

<Stage>
  <MiniWindow>
    {#snippet toolbar()}
      <span class="katip-button"><img src="/icons/icon-32.png" alt="" /></span>
      <span class="cursor"></span>
    {/snippet}
    <div class="panel"><MiniSidebar rows={7} /></div>
    <div class="page">
      <span class="heading"></span>
      <span class="text"></span>
      <span class="text short"></span>
      <span class="picture"></span>
    </div>
  </MiniWindow>
</Stage>

<style>
  .katip-button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    animation: press 6s ease infinite;
  }

  .katip-button img {
    width: 13px;
    height: 13px;
  }

  .cursor {
    position: absolute;
    top: 13px;
    right: 9px;
    width: 0;
    height: 0;
    border-top: 11px solid var(--ink);
    border-right: 7px solid transparent;
    filter: drop-shadow(0 0 1px var(--surface));
    opacity: 0;
    rotate: -20deg;
    animation: point 6s ease infinite;
  }

  .panel {
    flex: none;
    width: 30%;
    overflow: hidden;
    border-right: 1px solid var(--hairline);
    animation: slide 6s ease infinite;
  }

  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 3cqh;
    padding: 6cqh 7cqh;
  }

  .page span {
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }

  .heading {
    width: 45%;
    height: 4cqh;
  }

  .text {
    width: 80%;
    height: 2cqh;
  }

  .short {
    width: 60%;
  }

  .picture {
    flex: 1;
    max-height: 30cqh;
    margin-top: 2cqh;
  }

  @keyframes point {
    0% {
      translate: -60px 70px;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    28% {
      translate: 0 0;
      scale: 1;
    }
    32% {
      scale: 0.8;
    }
    36%,
    62% {
      translate: 0 0;
      scale: 1;
      opacity: 1;
    }
    72%,
    100% {
      translate: 0 0;
      opacity: 0;
    }
  }

  @keyframes press {
    0%,
    29%,
    40%,
    100% {
      background: transparent;
    }
    32% {
      background: var(--accent-soft);
    }
  }

  @keyframes slide {
    0%,
    32% {
      width: 0;
    }
    42%,
    88% {
      width: 30%;
    }
    98%,
    100% {
      width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .katip-button,
    .cursor,
    .panel {
      animation: none;
    }
  }
</style>
