<script lang="ts">
  import type { BookmarkId } from "#platform/browser"
  import { messages } from "../messages"
  import { getSidebarContext } from "../state/sidebar-context"
  import Icon from "./Icon.svelte"

  interface Props {
    bookmarkId: BookmarkId
    /** 小窓をこの要素の下に出す */
    anchor: HTMLElement
  }

  const { bookmarkId, anchor }: Props = $props()
  const ctx = getSidebarContext()
  const isOpen = $derived(ctx.folderSearch.current?.bookmarkId === bookmarkId)

  const open = (event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
    ctx.tooltip.hide()
    ctx.folderSearch.open({
      bookmarkId,
      anchor: anchor.getBoundingClientRect(),
      trigger: event.currentTarget,
    })
  }
</script>

<button
  class="search-button"
  class:open={isOpen}
  type="button"
  aria-label={messages.folderSearch.open}
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  onclick={open}
>
  <Icon name="search" size={13} />
</button>

<style>
  .search-button {
    position: absolute;
    top: 50%;
    right: 6px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    opacity: 0;
    transform: translateY(-50%);
    transition:
      opacity 120ms ease,
      background-color 120ms ease;
  }

  :global(:hover) > .search-button,
  .search-button:focus-visible,
  .search-button.open {
    opacity: 1;
  }

  .search-button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
