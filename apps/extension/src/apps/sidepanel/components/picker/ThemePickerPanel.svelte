<script lang="ts">
  import { untrack } from "svelte"
  import { neutralTheme, type SpaceTheme } from "#modules/theme"
  import type { Point } from "../../logic/menu-position"
  import { getSidebarContext } from "../../state/sidebar-context"
  import type { OpenThemePicker } from "../../state/theme-picker.svelte"
  import { popoverPosition } from "../popover-position"
  import ThemeEditor from "./ThemeEditor.svelte"

  interface Props {
    picker: OpenThemePicker
    onClose: () => void
  }

  const { picker, onClose }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)

  const spaceId = untrack(() => picker.spaceId)
  const theme = $derived(
    ctx.themeDraft.themeFor(spaceId) ??
      ctx.view.spaces.find((space) => space.id === spaceId)?.theme ??
      neutralTheme,
  )

  const preview = (next: SpaceTheme) => ctx.themeDraft.preview(spaceId, next)
  const settle = () => ctx.themeDraft.settle()
  const commit = (next: SpaceTheme) => ctx.themeDraft.commit(spaceId, next)

  let panel = $state<HTMLDivElement>()
  let position = $state<Point>(untrack(() => ({ x: picker.anchor.left, y: picker.anchor.bottom })))

  const placeAndFocus = (node: HTMLDivElement) => {
    position = popoverPosition(node, picker.anchor)
    if (picker.takesFocus) node.focus()
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    onClose()
  }

  const closeIfOutside = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Node) || panel?.contains(target) === true) return
    onClose()
  }
</script>

<svelte:window onkeydown={closeOnEscape} onpointerdown={closeIfOutside} />

<div
  bind:this={panel}
  class="picker"
  role="dialog"
  aria-label={t("sidepanel.theme.label")}
  tabindex="-1"
  style:left="{position.x}px"
  style:top="{position.y}px"
  {@attach placeAndFocus}
>
  <ThemeEditor {theme} {t} onPreview={preview} onSettle={settle} onCommit={commit} />
</div>

<style>
  .picker {
    position: absolute;
    z-index: 22;
    width: min(340px, calc(100% - 16px));
    border-radius: 18px;
    animation: picker-in 160ms ease-out;
  }

  .picker:focus {
    outline: none;
  }

  @keyframes picker-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picker {
      animation: none;
    }
  }
</style>
