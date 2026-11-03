<script lang="ts">
  import { Option } from "effect"
  import { untrack } from "svelte"
  import { FolderIcon } from "#modules/pinned"
  import { gridIndexAfter } from "../logic/grid-navigation"
  import type { Point } from "../logic/menu-position"
  import { findPinnedNode } from "../logic/view-queries"
  import type { OpenFolderIconPicker } from "../state/folder-icon-picker.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import FolderGlyph from "./FolderGlyph.svelte"
  import FolderIconGlyph from "./FolderIconGlyph.svelte"
  import { popoverPosition } from "./popover-position"

  interface Props {
    picker: OpenFolderIconPicker
    onClose: () => void
  }

  const { picker, onClose }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  // The parent's picker becomes null once the popover closes, so the values used after a
  // choice are captured when it opens
  const { bookmarkId, anchor, trigger } = untrack(() => picker)

  const COLUMNS = 5
  const choices: ReadonlyArray<FolderIcon | null> = [null, ...FolderIcon.literals]

  const folder = $derived.by(() => {
    const pinned = ctx.activeSpace.pinned
    if (pinned._tag === "Unavailable") return null
    const node = Option.getOrNull(findPinnedNode(pinned.nodes, bookmarkId))
    return node?._tag === "PinnedFolder" ? node : null
  })
  const currentIcon = $derived(folder?.icon ?? null)

  $effect(() => {
    if (folder === null) onClose()
  })

  let panel = $state<HTMLDivElement>()
  let position = $state<Point>({ x: anchor.left, y: anchor.bottom })
  let focused = $state(untrack(() => choices.indexOf(currentIcon)))

  const focusChoice = (index: number) => {
    focused = index
    panel?.querySelectorAll<HTMLButtonElement>(".choice")[index]?.focus()
  }

  // anchor may be a DOMRect, whose coordinates are prototype getters that spreading doesn't copy
  const placeAndFocus = (node: HTMLDivElement) => {
    const { left, right, top, bottom } = anchor
    position = popoverPosition(node, { left, right, top, bottom: bottom + 4 })
    focusChoice(focused)
  }

  const nameOf = (choice: FolderIcon | null) =>
    choice === null ? t("sidepanel.folderIcon.default") : t(`sidepanel.folderIcon.${choice}`)

  const closeAndReturnFocus = () => {
    onClose()
    if (trigger.isConnected) trigger.focus()
  }

  const choose = (icon: FolderIcon | null) => {
    closeAndReturnFocus()
    void ctx.run({ _tag: "SetFolderIcon", bookmarkId, icon })
  }

  const onChoiceKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      onClose()
      return
    }
    const next = gridIndexAfter(event.key, focused, { count: choices.length, columns: COLUMNS })
    if (Option.isNone(next)) return
    event.preventDefault()
    focusChoice(next.value)
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    closeAndReturnFocus()
  }

  const closeIfOutside = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Node) || panel?.contains(target) === true) return
    onClose()
  }
</script>

<svelte:window
  onkeydown={closeOnEscape}
  onpointerdown={closeIfOutside}
  onblur={onClose}
  onresize={onClose}
/>

<div
  bind:this={panel}
  class="icon-picker glass"
  role="dialog"
  aria-label={t("sidepanel.folderIcon.label")}
  style:left="{position.x}px"
  style:top="{position.y}px"
  style:--columns={COLUMNS}
  {@attach placeAndFocus}
>
  {#each choices as choice, index (index)}
    <button
      class="choice"
      type="button"
      tabindex={index === focused ? 0 : -1}
      aria-label={nameOf(choice)}
      aria-pressed={choice === currentIcon}
      title={nameOf(choice)}
      onfocus={() => (focused = index)}
      onkeydown={onChoiceKeyDown}
      onclick={() => choose(choice)}
    >
      {#if choice === null}
        <FolderGlyph isOpen={false} />
      {:else}
        <FolderIconGlyph icon={choice} />
      {/if}
    </button>
  {/each}
</div>

<style>
  .icon-picker {
    position: absolute;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(var(--columns), 32px);
    gap: 3px;
    padding: 6px;
    border-radius: 11px;
    animation: picker-in 110ms ease-out;
  }

  .choice {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--accent);
    transition: background-color 120ms ease;
  }

  .choice:hover {
    background: var(--glass-hover);
  }

  .choice[aria-pressed="true"] {
    background: var(--glass-hover);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--glass-text) 35%, transparent);
  }

  @keyframes picker-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-picker {
      animation: none;
    }
  }
</style>
