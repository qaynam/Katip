<script lang="ts">
  import type { FavoriteView } from "#protocol"
  import { edgeAt, slotAt } from "../logic/drag-drop"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"

  interface Props {
    favorites: ReadonlyArray<FavoriteView>
  }

  const { favorites }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const emptyKey = "favorites-empty"

  const onTileDragOver = (
    event: DragEvent & { currentTarget: HTMLElement },
    key: string,
    index: number,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientX - bounds.left, bounds.width)
    ctx.drag.offer(event, key, edge, { _tag: "Favorites", slot: slotAt(index, edge) })
  }

  const onGridDragOver = (event: DragEvent) => {
    if (event.target !== event.currentTarget) {
      ctx.drag.keep(event)
      return
    }
    ctx.drag.offer(event, `favorite:end`, "after", {
      _tag: "Favorites",
      slot: favorites.length,
    })
  }
</script>

<section class="favorites" aria-label={t("sidepanel.favorites.region")}>
  {#if favorites.length === 0}
    <p
      class="empty"
      class:drop-into={ctx.drag.zoneFor(emptyKey) !== null}
      ondragover={(event) =>
        ctx.drag.offer(event, emptyKey, "into", { _tag: "Favorites", slot: 0 })}
    >
      {t("sidepanel.favorites.empty")}
    </p>
  {:else}
    <ul class="grid" ondragover={onGridDragOver}>
      {#each favorites as favorite, index (favorite.tabId)}
        {@const key = `favorite:${favorite.tabId}`}
        {@const zone = ctx.drag.zoneFor(key)}
        <li
          class="cell"
          class:drop-before={zone === "before"}
          class:drop-after={zone === "after"}
          class:dragged={ctx.drag.sourceKey === key}
          draggable="true"
          ondragstart={(event) =>
            ctx.drag.begin(event, key, { _tag: "Favorite", tabId: favorite.tabId, index })}
          ondragend={() => ctx.drag.end()}
          ondragover={(event) => onTileDragOver(event, key, index)}
        >
          <button
            class="tile"
            class:active={favorite.isActive}
            type="button"
            aria-label={favorite.title}
            aria-current={favorite.isActive ? "true" : undefined}
            onclick={() => void ctx.run({ _tag: "ActivateTab", tabId: favorite.tabId })}
            onpointerenter={(event) =>
              ctx.tooltip.schedule(
                { title: favorite.title },
                { x: event.clientX, y: event.clientY },
              )}
            onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
            onpointerleave={() => ctx.tooltip.hide()}
            onpointerdown={() => ctx.tooltip.hide()}
          >
            <Favicon
              pageUrl={favorite.url}
              favIconUrl={favorite.favIconUrl}
              title={favorite.title}
              size={18}
            />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .favorites {
    flex: none;
    padding: 8px 8px 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
  }

  .cell {
    position: relative;
    list-style: none;
  }

  .cell.dragged {
    opacity: 0.4;
  }

  .tile {
    display: grid;
    place-items: center;
    width: 100%;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--surface-raised);
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
  }

  .tile:hover {
    background: linear-gradient(var(--surface-hover), var(--surface-hover)) var(--surface-raised);
  }

  .tile.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
  }

  .cell.drop-before::before,
  .cell.drop-after::after {
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .cell.drop-before::before {
    left: -5px;
  }

  .cell.drop-after::after {
    right: -5px;
  }

  .empty {
    display: grid;
    place-items: center;
    height: 44px;
    margin: 0;
    padding: 0 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface-raised) 55%, transparent);
    color: var(--text-muted);
    font-size: 11.5px;
    text-align: center;
    transition: background-color 140ms ease;
  }

  .empty.drop-into {
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1.5px var(--drop-line);
  }
</style>
