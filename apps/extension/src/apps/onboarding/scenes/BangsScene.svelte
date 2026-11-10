<script lang="ts">
  import Stage from "../components/Stage.svelte"

  // Not translated: it is what a person types, and reads the same in every language
  const TYPED = "!gh katip"
</script>

<Stage>
  <div class="spotlight">
    <div class="search">
      <span class="glass"></span>
      <span class="typed" style:--length={TYPED.length}>{TYPED}</span>
      <span class="caret"></span>
    </div>
    <div class="results">
      <span class="row selected"><span class="site"></span><b style:width="52%"></b></span>
      <span class="row"><i></i><b style:width="40%"></b></span>
      <span class="row"><i></i><b style:width="46%"></b></span>
    </div>
  </div>
</Stage>

<style>
  .spotlight {
    width: 120cqh;
    overflow: hidden;
    border-radius: 4cqh;
    background: var(--surface);
    box-shadow: var(--window-shadow);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 2.4cqh;
    height: 15cqh;
    padding: 0 4cqh;
    border-bottom: 1px solid var(--hairline);
    font-size: 6cqh;
  }

  .glass {
    flex: none;
    width: 3.6cqh;
    height: 3.6cqh;
    border: 0.7cqh solid var(--ink-secondary);
    border-radius: 50%;
  }

  .typed {
    overflow: hidden;
    color: var(--ink);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    white-space: nowrap;
    width: calc(var(--length) * 1ch);
    animation: type 6s steps(9, end) infinite;
  }

  .caret {
    width: 0.4cqh;
    height: 7cqh;
    margin-left: -1.6cqh;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1.4cqh;
    padding: 3cqh;
    animation: reveal 6s ease infinite;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 3cqh;
    height: 9cqh;
    padding: 0 2cqh;
    border-radius: 2cqh;
  }

  .selected {
    background: var(--accent-soft);
  }

  .site {
    flex: none;
    width: 5cqh;
    height: 5cqh;
    border-radius: 50%;
    background: var(--ink);
  }

  .row i {
    flex: none;
    width: 5cqh;
    height: 5cqh;
    border-radius: 1.4cqh;
    background: color-mix(in srgb, var(--ink) 14%, transparent);
  }

  .row b {
    height: 2.2cqh;
    border-radius: 1cqh;
    background: color-mix(in srgb, var(--ink) 22%, transparent);
  }

  @keyframes type {
    0%,
    8% {
      width: 0;
    }
    40%,
    90% {
      width: calc(var(--length) * 1ch);
    }
    100% {
      width: 0;
    }
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @keyframes reveal {
    0%,
    40% {
      opacity: 0;
      translate: 0 2cqh;
    }
    48%,
    90% {
      opacity: 1;
      translate: 0 0;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typed,
    .caret,
    .results {
      animation: none;
    }
  }
</style>
