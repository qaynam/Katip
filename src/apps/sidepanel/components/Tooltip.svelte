<script lang="ts">
  import type { Point } from "../logic/menu-position"
  import { getSidebarContext } from "../state/sidebar-context"
  import { popoverPosition } from "./popover-position"

  const ctx = getSidebarContext()
  const tooltip = $derived(ctx.tooltip.current)

  // ポインタの真下に出すとカーソルで隠れるため、少し右下にずらす
  const CURSOR_CLEARANCE = { x: 10, y: 18 }

  let position = $state<Point>({ x: 0, y: 0 })

  const place = (node: HTMLElement) => {
    if (tooltip === null) return
    const left = tooltip.at.x + CURSOR_CLEARANCE.x
    const top = tooltip.at.y + CURSOR_CLEARANCE.y
    position = popoverPosition(node, { left, right: left, top, bottom: top })
  }
</script>

<svelte:window onblur={() => ctx.tooltip.hide()} onkeydown={() => ctx.tooltip.hide()} />

{#if tooltip !== null}
  {#key tooltip}
    <div
      class="tooltip glass"
      role="tooltip"
      style:left="{position.x}px"
      style:top="{position.y}px"
      {@attach place}
    >
      <span class="title">{tooltip.title}</span>
      {#if tooltip.hint !== undefined}
        <span class="hint">{tooltip.hint}</span>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .tooltip {
    position: absolute;
    z-index: 25;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-width: min(240px, calc(100% - 16px));
    padding: 5px 8px 6px;
    border-radius: 7px;
    font-size: 11.5px;
    line-height: 1.3;
    pointer-events: none;
    animation: tooltip-in 120ms ease-out;
  }

  .title {
    overflow: hidden;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .hint {
    color: var(--glass-muted);
    font-size: 11px;
    font-weight: 500;
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tooltip {
      animation: none;
    }
  }
</style>
