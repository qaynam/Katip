<script lang="ts">
  import type { SpaceId } from "#modules/space"
  import type { SpaceView } from "#protocol"
  import { edgeAt, slotAt } from "../logic/drag-drop"
  import { pointRect } from "../logic/menu-position"
  import { suggestedTheme } from "../logic/space-themes"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"
  import { spaceMenuEntries } from "./menus"

  interface Props {
    spaces: ReadonlyArray<SpaceView>
    activeSpaceId: SpaceId
    isArchiveOpen: boolean
    onToggleArchive: () => void
  }

  const { spaces, activeSpaceId, isArchiveOpen, onToggleArchive }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const switchTo = (spaceId: SpaceId) =>
    void ctx.run({ _tag: "SwitchSpace", windowId: ctx.view.windowId, spaceId })

  const createSpace = async () => {
    ctx.spaceSetup.requestForNextCreated(new Set(spaces.map((space) => space.id)), {
      rename: true,
      editTheme: true,
    })
    const outcome = await ctx.run({
      _tag: "CreateSpace",
      windowId: ctx.view.windowId,
      theme: suggestedTheme(spaces),
    })
    if (outcome._tag === "Failed") ctx.spaceSetup.cancel()
  }

  const openSpaceMenu = (event: MouseEvent, space: SpaceView) => {
    event.preventDefault()
    ctx.tooltip.hide()
    ctx.menu.open({
      label: t("sidepanel.space.menu"),
      anchor: pointRect({ x: event.clientX, y: event.clientY }),
      entries: spaceMenuEntries(ctx, space),
      trigger: null,
    })
  }

  const onMarkDragOver = (
    event: DragEvent & { currentTarget: HTMLElement },
    key: string,
    index: number,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = edgeAt(event.clientX - bounds.left, bounds.width)
    ctx.drag.offer(event, key, edge, { _tag: "SpaceBar", slot: slotAt(index, edge) })
  }

  const onListDragOver = (event: DragEvent) => {
    if (event.target !== event.currentTarget) {
      ctx.drag.keep(event)
      return
    }
    ctx.drag.offer(event, "space-bar-end", "after", { _tag: "SpaceBar", slot: spaces.length })
  }

  let markList = $state<HTMLUListElement>()
  // Reading activeSpaceId directly would rerun on every view update, even if unchanged
  const currentSpaceId = $derived(activeSpaceId)
  $effect(() => {
    for (const mark of markList?.querySelectorAll<HTMLElement>("[data-space-id]") ?? []) {
      if (mark.dataset["spaceId"] === currentSpaceId) {
        mark.scrollIntoView({ block: "nearest", inline: "nearest" })
      }
    }
  })

  // Horizontal scrolling of the marks must not be taken for the sidebar-wide swipe that switches
  // Spaces. The vertical wheel scrolls horizontally, since the marks sit in a single row
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

  const showName = (event: PointerEvent, space: SpaceView) =>
    ctx.tooltip.schedule({ title: space.name }, { x: event.clientX, y: event.clientY })
</script>

<footer class="bottom-bar">
  <button
    class="icon-button"
    class:pressed={isArchiveOpen}
    type="button"
    aria-label={t("sidepanel.archive.title")}
    aria-pressed={isArchiveOpen}
    onclick={onToggleArchive}
  >
    <Icon name="archive" />
  </button>

  <nav class="marks" aria-label={t("sidepanel.space.switcher")}>
    <ul bind:this={markList} ondragover={onListDragOver} {@attach scrollHorizontally}>
      {#each spaces as space, index (space.id)}
        {@const key = `space-mark:${space.id}`}
        {@const zone = ctx.drag.zoneFor(key)}
        <li
          class="mark-cell"
          class:drop-before={zone === "before"}
          class:drop-after={zone === "after"}
          class:dragged={ctx.drag.sourceKey === key}
          draggable="true"
          ondragstart={(event) =>
            ctx.drag.begin(event, key, { _tag: "SpaceMark", spaceId: space.id, index })}
          ondragend={() => ctx.drag.end()}
          ondragover={(event) => onMarkDragOver(event, key, index)}
        >
          <button
            class="mark"
            class:active={space.id === activeSpaceId}
            type="button"
            aria-label={space.name}
            aria-current={space.id === activeSpaceId ? "true" : undefined}
            data-space-id={space.id}
            onclick={() => switchTo(space.id)}
            oncontextmenu={(event) => openSpaceMenu(event, space)}
            onpointerenter={(event) => showName(event, space)}
            onpointermove={(event) => ctx.tooltip.follow({ x: event.clientX, y: event.clientY })}
            onpointerleave={() => ctx.tooltip.hide()}
            onpointerdown={() => ctx.tooltip.hide()}
          >
            <span class="dot"></span>
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <button
    class="icon-button"
    type="button"
    aria-label={t("sidepanel.space.create")}
    onclick={createSpace}
  >
    <Icon name="plus" />
  </button>
</footer>

<style>
  .bottom-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 44px;
    padding: 0 8px 4px;
  }

  .icon-button {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .icon-button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .icon-button.pressed {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text);
  }

  .marks {
    display: flex;
    flex: 1;
    justify-content: center;
    min-width: 0;
  }

  .marks ul {
    display: flex;
    gap: 2px;
    max-width: 100%;
    margin: 0;
    padding: 0 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mark-cell {
    position: relative;
    flex: none;
    list-style: none;
  }

  .mark-cell.dragged {
    opacity: 0.4;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    transition: color 120ms ease;
  }

  .mark:hover,
  .mark.active {
    color: var(--text);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.55;
    transition:
      transform 160ms ease,
      opacity 160ms ease;
  }

  .mark:hover .dot {
    opacity: 0.85;
  }

  .mark.active .dot {
    opacity: 1;
    transform: scale(1.3);
  }

  .mark-cell.drop-before::before,
  .mark-cell.drop-after::after {
    position: absolute;
    top: 5px;
    bottom: 5px;
    width: 2px;
    border-radius: 1px;
    background: var(--drop-line);
    content: "";
    pointer-events: none;
  }

  .mark-cell.drop-before::before {
    left: -2px;
  }

  .mark-cell.drop-after::after {
    right: -2px;
  }
</style>
