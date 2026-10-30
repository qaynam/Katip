<script lang="ts">
  import { untrack } from "svelte"
  import type { Point } from "../logic/menu-position"
  import type { MenuEntry, OpenMenu } from "../state/menu-controller.svelte"
  import Icon from "./Icon.svelte"
  import { popoverPosition } from "./popover-position"

  type Submenu = Extract<MenuEntry, { readonly _tag: "Submenu" }>

  interface Props {
    menu: OpenMenu
    onClose: () => void
  }

  const { menu, onClose }: Props = $props()

  // 狭いサイドパネルでは横に開くサブメニューがどちらの側にも収まらないため、
  // サブメニューは同じ場所で中身を差し替えて開く
  let trail = $state.raw<ReadonlyArray<Submenu>>([])
  const page = $derived(trail.at(-1))
  const entries = $derived(page?.entries ?? menu.entries)
  let panel = $state<HTMLDivElement>()
  let position = $state<Point>(untrack(() => ({ x: menu.anchor.left, y: menu.anchor.bottom })))

  const focusableItems = (node: HTMLElement) =>
    [...node.querySelectorAll<HTMLElement>("[role^='menuitem']")].filter(
      (item) => !item.hasAttribute("disabled"),
    )

  const placeAndFocus = (node: HTMLDivElement) => {
    position = popoverPosition(node, menu.anchor)
    focusableItems(node)[0]?.focus()
  }

  const select = (entry: Extract<MenuEntry, { readonly _tag: "Action" }>) => {
    onClose()
    entry.onSelect()
  }

  const openSubmenu = (entry: Submenu) => {
    trail = [...trail, entry]
  }

  const goBack = () => {
    trail = trail.slice(0, -1)
  }

  const moveFocus = (step: number | "first" | "last") => {
    if (panel === undefined) return
    const items = focusableItems(panel)
    const current = items.findIndex((item) => item === document.activeElement)
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? items.length - 1
          : (current + step + items.length) % items.length
    items[next]?.focus()
  }

  const navigate = (event: KeyboardEvent) => {
    const actions: Partial<Record<string, () => void>> = {
      ArrowDown: () => moveFocus(1),
      ArrowUp: () => moveFocus(-1),
      Home: () => moveFocus("first"),
      End: () => moveFocus("last"),
      ArrowLeft: () => {
        if (trail.length > 0) goBack()
      },
      Tab: onClose,
    }
    const handle = actions[event.key]
    if (handle === undefined) return
    if (event.key !== "Tab") event.preventDefault()
    handle()
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }

  const closeIfOutside = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (panel?.contains(target) === true || menu.trigger?.contains(target) === true) return
    onClose()
  }
</script>

<svelte:window
  onkeydown={closeOnEscape}
  onpointerdown={closeIfOutside}
  onblur={onClose}
  onresize={onClose}
/>

{#key trail.length}
  <div
    bind:this={panel}
    class="menu glass"
    role="menu"
    tabindex="-1"
    aria-label={page?.label ?? menu.label}
    style:left="{position.x}px"
    style:top="{position.y}px"
    onkeydown={navigate}
    oncontextmenu={(event) => event.preventDefault()}
    {@attach placeAndFocus}
  >
    {#if page !== undefined}
      <button class="item back" type="button" role="menuitem" onclick={goBack}>
        <Icon name="chevronLeft" size={14} />
        <span class="label">{page.label}</span>
      </button>
      <div class="separator" role="separator"></div>
    {/if}
    {#each entries as entry, index (index)}
      {#if entry._tag === "Separator"}
        <div class="separator" role="separator"></div>
      {:else if entry._tag === "Action"}
        <button
          class="item"
          class:danger={entry.tone === "danger"}
          type="button"
          role="menuitem"
          disabled={entry.disabled === true}
          onclick={() => select(entry)}
        >
          {#if entry.swatch !== undefined}
            <span class="dot" style:background={entry.swatch}></span>
          {/if}
          <span class="label">{entry.label}</span>
        </button>
      {:else}
        <button
          class="item"
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          onclick={() => openSubmenu(entry)}
          onkeydown={(event) => {
            if (event.key === "ArrowRight") openSubmenu(entry)
          }}
        >
          <span class="label">{entry.label}</span>
          <Icon name="chevronRight" size={14} />
        </button>
      {/if}
    {/each}
  </div>
{/key}

<style>
  .menu {
    position: absolute;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    max-width: calc(100% - 16px);
    max-height: calc(100% - 16px);
    padding: 5px;
    overflow-y: auto;
    border-radius: 11px;
    font-size: 13px;
    animation: menu-in 110ms ease-out;
  }

  .menu:focus {
    outline: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0 9px;
    border: none;
    border-radius: 6px;
    background: none;
    text-align: start;
  }

  .item:hover:not(:disabled),
  .item:focus-visible {
    outline: none;
    background: var(--glass-hover);
  }

  .item:disabled {
    opacity: 0.4;
  }

  .item.danger {
    color: var(--danger);
  }

  .item.back {
    color: var(--glass-muted);
    font-weight: 600;
  }

  .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .separator {
    height: 0.5px;
    margin: 4px 8px;
    background: var(--glass-border);
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
    }
  }
</style>
