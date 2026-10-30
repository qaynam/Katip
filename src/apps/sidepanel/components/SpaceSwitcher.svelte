<script lang="ts">
  import type { SpaceId } from "#modules/space"
  import type { SpaceView } from "#protocol"
  import { edgeAt, slotAt } from "../logic/drag-drop"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import SpaceCreateForm from "./SpaceCreateForm.svelte"

  interface Props {
    spaces: ReadonlyArray<SpaceView>
    activeSpaceId: SpaceId
  }

  const { spaces, activeSpaceId }: Props = $props()
  const ctx = getSidebarContext()
  let isCreating = $state(false)

  const onChipDragOver = (
    event: DragEvent & { currentTarget: HTMLElement },
    key: string,
    index: number,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientX - bounds.left, bounds.width)
    ctx.drag.offer(event, key, edge, { _tag: "Switcher", slot: slotAt(index, edge) })
  }

  const onListDragOver = (event: DragEvent) => {
    if (event.target !== event.currentTarget) {
      ctx.drag.keep(event)
      return
    }
    ctx.drag.offer(event, "switcher-end", "after", { _tag: "Switcher", slot: spaces.length })
  }

  let chipList = $state<HTMLUListElement>()
  // activeSpaceId を直接読むと、ビューが届くたびに値が同じでも再実行されてしまう
  const currentSpaceId = $derived(activeSpaceId)
  $effect(() => {
    for (const chip of chipList?.querySelectorAll<HTMLElement>("[data-space-id]") ?? []) {
      if (chip.dataset["spaceId"] === currentSpaceId) {
        chip.scrollIntoView({ block: "nearest", inline: "nearest" })
      }
    }
  })

  // スイッチャーの横スクロールを、サイドバー全体のスワイプによる Space 切替と取り違えさせない。
  // 縦ホイールは横スクロールに読み替える（チップが横一列にしか並ばないため）
  const scrollHorizontally = (list: HTMLElement) => {
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation()
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      list.scrollLeft += event.deltaY
    }
    list.addEventListener("wheel", onWheel, { passive: false })
    return () => list.removeEventListener("wheel", onWheel)
  }
</script>

<nav class="switcher" aria-label="Space の切り替え">
  {#if isCreating}
    <div class="form-slot">
      <SpaceCreateForm onClose={() => (isCreating = false)} />
    </div>
  {:else}
    <ul bind:this={chipList} class="chips" ondragover={onListDragOver} {@attach scrollHorizontally}>
      {#each spaces as space, index (space.id)}
        {@const key = `chip:${space.id}`}
        {@const zone = ctx.drag.zoneFor(key)}
        <li
          class="chip-cell"
          class:drop-before={zone === "before"}
          class:drop-after={zone === "after"}
          class:dragged={ctx.drag.sourceKey === key}
          data-space-color={space.color}
          draggable="true"
          ondragstart={(event) =>
            ctx.drag.begin(event, key, { _tag: "SpaceChip", spaceId: space.id, index })}
          ondragend={() => ctx.drag.end()}
          ondragover={(event) => onChipDragOver(event, key, index)}
        >
          <button
            class="chip"
            class:active={space.id === activeSpaceId}
            type="button"
            aria-current={space.id === activeSpaceId ? "true" : undefined}
            title={space.name}
            data-space-id={space.id}
            onclick={() =>
              void ctx.run({ _tag: "SwitchSpace", windowId: ctx.view.windowId, spaceId: space.id })}
          >
            <span class="dot"></span>
            <span class="chip-name">{space.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button
    class="add"
    class:open={isCreating}
    type="button"
    aria-label={isCreating ? "Space の作成をやめる" : "Space を作成"}
    aria-expanded={isCreating}
    title={isCreating ? "やめる" : "Space を作成"}
    onclick={() => (isCreating = !isCreating)}
  >
    <Icon name="plus" />
  </button>
</nav>

<style>
  .switcher {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 6px 10px 10px;
  }

  .form-slot {
    flex: 1;
    min-width: 0;
  }

  .chips {
    display: flex;
    flex: 1;
    gap: 4px;
    min-width: 0;
    margin: 0;
    padding: 2px 16px 2px 2px;
    overflow-x: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
  }

  .chip-cell {
    position: relative;
    flex: none;
    list-style: none;
  }

  .chip-cell.dragged {
    opacity: 0.4;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 128px;
    height: 28px;
    padding: 0 11px 0 9px;
    border: none;
    border-radius: 14px;
    background: var(--surface-raised);
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 550;
    transition: background-color 120ms ease;
  }

  .chip:hover {
    background: var(--surface-raised-hover);
  }

  .chip.active {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text-on-surface);
  }

  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--space-swatch);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  }

  .chip-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chip-cell.drop-before::before,
  .chip-cell.drop-after::after {
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .chip-cell.drop-before::before {
    left: -3px;
  }

  .chip-cell.drop-after::after {
    right: -3px;
  }

  .add {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--surface-raised);
    color: inherit;
    transition:
      transform 150ms ease,
      background-color 120ms ease;
  }

  .add:hover {
    background: var(--surface-raised-hover);
  }

  .add.open {
    transform: rotate(45deg);
  }
</style>
