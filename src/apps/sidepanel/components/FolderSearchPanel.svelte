<script lang="ts">
  import { Option } from "effect"
  import { untrack } from "svelte"
  import { describeElapsed } from "../logic/elapsed-time"
  import {
    filterFolderSearch,
    folderSearchEntries,
    type FolderSearchEntry,
    type SearchableFolder,
  } from "../logic/folder-search"
  import type { Point } from "../logic/menu-position"
  import { findPinnedNode } from "../logic/view-queries"
  import { messages } from "../messages"
  import type { OpenFolderSearch } from "../state/folder-search.svelte"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"
  import Icon from "./Icon.svelte"
  import { popoverPosition } from "./popover-position"

  interface Props {
    search: OpenFolderSearch
    onClose: () => void
  }

  const { search, onClose }: Props = $props()
  const ctx = getSidebarContext()
  const ids = $props.id()
  const openedAt = Date.now()

  const folder = $derived.by((): SearchableFolder | null => {
    const pinned = ctx.activeSpace.pinned
    if (pinned._tag === "Unavailable") return null
    const node = Option.getOrNull(findPinnedNode(pinned.nodes, search.bookmarkId))
    return node?._tag === "PinnedFolder" || node?._tag === "PinnedLiveFolder" ? node : null
  })
  const entries = $derived(folder === null ? [] : folderSearchEntries(folder, ctx.view.windowId))
  let query = $state("")
  let highlighted = $state(0)
  const matches = $derived(filterFolderSearch(entries, query))

  let panel = $state<HTMLDivElement>()
  let position = $state<Point>(untrack(() => ({ x: search.anchor.left, y: search.anchor.bottom })))
  const width = $derived(Math.max(220, search.anchor.right - search.anchor.left))

  $effect(() => {
    if (folder === null) onClose()
  })

  const optionId = (index: number) => `${ids}-option-${index}`

  $effect(() => {
    document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" })
  })

  // anchor は DOMRect のことがあり、座標がプロトタイプの getter なので展開では写せない
  const place = (node: HTMLDivElement) => {
    const { left, right, top, bottom } = search.anchor
    position = popoverPosition(node, { left, right, top, bottom: bottom + 4 })
  }

  const focusInput = (input: HTMLInputElement) => input.focus()

  const detailOf = (entry: FolderSearchEntry) =>
    [
      entry.lastActivityAt === null ? "" : describeElapsed(entry.lastActivityAt, openedAt),
      entry.subtitle,
    ]
      .filter((part) => part !== "")
      .join(" · ")

  const choose = (entry: FolderSearchEntry) => {
    onClose()
    void ctx.run(entry.command)
  }

  const closeAndReturnFocus = () => {
    const trigger = search.trigger
    onClose()
    if (trigger.isConnected) trigger.focus()
  }

  const moveHighlight = (step: number) => {
    if (matches.length === 0) return
    highlighted = (highlighted + step + matches.length) % matches.length
  }

  const editQuery = (value: string) => {
    query = value
    highlighted = 0
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // 日本語入力の変換を確定する Enter や、候補を選ぶ矢印キーを横取りしない
    if (event.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      moveHighlight(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const entry = matches[highlighted]
      if (entry !== undefined) choose(entry)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      closeAndReturnFocus()
    } else if (event.key === "Tab") {
      onClose()
    }
  }

  const closeIfOutside = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (panel?.contains(target) === true || search.trigger.contains(target)) return
    onClose()
  }
</script>

<svelte:window onpointerdown={closeIfOutside} onblur={onClose} onresize={onClose} />

<div
  bind:this={panel}
  class="folder-search glass"
  role="dialog"
  aria-label={messages.folderSearch.open}
  style:left="{position.x}px"
  style:top="{position.y}px"
  style:width="{width}px"
  {@attach place}
>
  <div class="field">
    <Icon name="search" size={13} />
    <input
      type="text"
      role="combobox"
      aria-label={messages.folderSearch.open}
      aria-expanded="true"
      aria-autocomplete="list"
      aria-controls="{ids}-results"
      aria-activedescendant={matches.length === 0 ? undefined : optionId(highlighted)}
      placeholder={messages.folderSearch.placeholder}
      value={query}
      oninput={(event) => editQuery(event.currentTarget.value)}
      onkeydown={onKeyDown}
      {@attach focusInput}
    />
  </div>
  <div id="{ids}-results" class="results" role="listbox" aria-label={messages.folderSearch.results}>
    {#each matches as entry, index (entry.key)}
      {@const detail = detailOf(entry)}
      <button
        id={optionId(index)}
        class="option"
        class:highlighted={index === highlighted}
        type="button"
        role="option"
        tabindex="-1"
        aria-selected={index === highlighted}
        onpointermove={() => (highlighted = index)}
        onclick={() => choose(entry)}
      >
        <span class="favicon">
          <Favicon pageUrl={entry.pageUrl} favIconUrl={entry.favIconUrl} title={entry.title} />
        </span>
        <span class="text">
          <span class="title">{entry.title}</span>
          {#if detail !== ""}
            <span class="detail">{detail}</span>
          {/if}
        </span>
        {#if entry.isUnseen}
          <span class="unseen-dot" aria-hidden="true"></span>
          <span class="visually-hidden">{messages.liveFolder.unseen}</span>
        {/if}
      </button>
    {/each}
  </div>
  {#if matches.length === 0}
    <p class="empty">
      {entries.length === 0 ? messages.folderSearch.empty : messages.folderSearch.noMatch}
    </p>
  {/if}
</div>

<style>
  .folder-search {
    position: absolute;
    z-index: 20;
    display: flex;
    flex-direction: column;
    max-width: calc(100% - 16px);
    max-height: min(360px, calc(100% - 16px));
    overflow: hidden;
    border-radius: 11px;
    font-size: 13px;
    animation: search-in 110ms ease-out;
  }

  .field {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 12px;
    border-bottom: 0.5px solid var(--glass-border);
    color: var(--glass-muted);
  }

  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: none;
    color: var(--glass-text);
    font-size: 13px;
  }

  .field input::placeholder {
    color: var(--glass-muted);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    overflow-y: auto;
  }

  .results:empty {
    display: none;
  }

  .option {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 4px 9px;
    border: none;
    border-radius: 7px;
    background: none;
    text-align: start;
  }

  .option.highlighted {
    background: var(--glass-hover);
  }

  .option:focus-visible {
    outline: none;
  }

  .favicon {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .title,
  .detail {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-weight: 600;
  }

  .detail {
    color: var(--glass-muted);
    font-size: 11px;
  }

  .unseen-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .empty {
    margin: 0;
    padding: 12px;
    color: var(--glass-muted);
    font-size: 12px;
  }

  @keyframes search-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .folder-search {
      animation: none;
    }
  }
</style>
