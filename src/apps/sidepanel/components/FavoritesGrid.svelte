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

<section class="favorites" aria-label="Favorites">
  {#if favorites.length === 0}
    <p
      class="empty"
      class:drop-into={ctx.drag.zoneFor(emptyKey) !== null}
      ondragover={(event) =>
        ctx.drag.offer(event, emptyKey, "into", { _tag: "Favorites", slot: 0 })}
    >
      <strong>Favorites</strong>
      <span>よく使うタブをここにドラッグすると、このウィンドウのどの Space からでも開けます</span>
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
            title={favorite.title}
            aria-label={favorite.title}
            aria-current={favorite.isActive ? "true" : undefined}
            onclick={() => void ctx.run({ _tag: "ActivateTab", tabId: favorite.tabId })}
          >
            <Favicon
              pageUrl={favorite.url}
              favIconUrl={favorite.favIconUrl}
              title={favorite.title}
              size={20}
            />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .favorites {
    padding: 10px 10px 4px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
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
    border-radius: 12px;
    background: var(--surface-raised);
    color: inherit;
    transition: background-color 120ms ease;
  }

  .tile:hover {
    background: var(--surface-raised-hover);
  }

  .tile.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text-on-surface);
  }

  .cell.drop-before::before,
  .cell.drop-after::after {
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .cell.drop-before::before {
    left: -4px;
  }

  .cell.drop-after::after {
    right: -4px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 10px 12px;
    border: 1px dashed var(--rule);
    border-radius: 12px;
    color: var(--text-muted);
    font-size: 11.5px;
    line-height: 1.45;
  }

  .empty strong {
    color: var(--text);
    font-size: 12px;
  }

  .empty.drop-into {
    border-color: var(--drop-line);
    background: var(--surface-raised);
  }
</style>
