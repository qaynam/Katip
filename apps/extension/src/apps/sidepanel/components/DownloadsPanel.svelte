<script lang="ts">
  import { Match, Option } from "effect"
  import type { MessageKey } from "#modules/i18n"
  import {
    DOWNLOAD_KINDS,
    searchDownloads,
    type DownloadKindFilter,
  } from "../logic/download-search"
  import {
    newestFirst,
    progressDetails,
    sourceHostOf,
    type Download,
    type DownloadDetail,
  } from "../logic/downloads"
  import { getSidebarContext } from "../state/sidebar-context"
  import DownloadFileIcon from "./DownloadFileIcon.svelte"
  import Icon, { type IconName } from "./Icon.svelte"

  // Searched beyond what fits on screen, so an older download is still found by its name
  const SEARCHED_COUNT = 200

  const kindMessages = {
    All: "sidepanel.downloads.kind.all",
    Image: "sidepanel.downloads.kind.image",
    Video: "sidepanel.downloads.kind.video",
    Audio: "sidepanel.downloads.kind.audio",
    Document: "sidepanel.downloads.kind.document",
    Archive: "sidepanel.downloads.kind.archive",
    Other: "sidepanel.downloads.kind.other",
  } as const satisfies Record<DownloadKindFilter, MessageKey>

  const kindFilters: ReadonlyArray<DownloadKindFilter> = ["All", ...DOWNLOAD_KINDS]

  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()

  let downloads = $state.raw<ReadonlyArray<Download> | null>(null)
  $effect(() =>
    ctx.downloads.watchRecent(SEARCHED_COUNT, (recent) => (downloads = newestFirst(recent))),
  )

  let query = $state("")
  let kind = $state<DownloadKindFilter>("All")
  let highlighted = $state(0)
  let searchField = $state<HTMLInputElement>()
  let view = $state<HTMLElement>()
  const matches = $derived(downloads === null ? [] : searchDownloads(downloads, query, kind))

  const rowId = (index: number) => `${ids}-row-${index}`

  $effect(() => {
    document.getElementById(rowId(highlighted))?.scrollIntoView({ block: "nearest" })
  })

  const showLabel = $derived(
    t(
      ctx.downloads.fileManager === "Finder"
        ? "sidepanel.downloads.showInFinder"
        : "sidepanel.downloads.showInFolder",
    ),
  )

  interface RowAction {
    readonly label: string
    readonly icon: IconName
    readonly run: () => void
  }

  const actionsOf = (download: Download): ReadonlyArray<RowAction> => {
    const { id } = download
    const show: RowAction = { label: showLabel, icon: "folder", run: () => ctx.downloads.show(id) }
    const pause: RowAction = {
      label: t("sidepanel.downloads.pause"),
      icon: "pause",
      run: () => ctx.downloads.pause(id),
    }
    const resume: RowAction = {
      label: t("sidepanel.downloads.resume"),
      icon: "play",
      run: () => ctx.downloads.resume(id),
    }
    const cancel: RowAction = {
      label: t("sidepanel.downloads.cancel"),
      icon: "close",
      run: () => ctx.downloads.cancel(id),
    }
    return Match.valueTags(download.progress, {
      Complete: () => [show],
      InProgress: () => [pause, cancel],
      Paused: ({ canResume }) => (canResume ? [resume, cancel] : [cancel]),
      Failed: ({ canResume }) => (canResume ? [resume] : []),
      Deleted: () => [],
      Canceled: () => [],
    })
  }

  const detailsOf = (download: Download): ReadonlyArray<DownloadDetail> => [
    ...Option.toArray(sourceHostOf(download.url)).map((host): DownloadDetail => ({
      text: host,
      tone: "Plain",
    })),
    ...progressDetails(download.progress, ctx.translator),
  ]

  const editQuery = (value: string) => {
    query = value
    highlighted = 0
  }

  const chooseKind = (next: DownloadKindFilter) => {
    kind = next
    highlighted = 0
  }

  const openIfFinished = (download: Download | undefined) => {
    if (download?.progress._tag === "Complete") ctx.downloads.open(download.id)
  }

  const moveHighlight = (step: number) => {
    if (matches.length === 0) return
    highlighted = (highlighted + step + matches.length) % matches.length
  }

  const focusOnOpen = (input: HTMLInputElement) => input.focus()

  const onSearchKeyDown = (event: KeyboardEvent) => {
    // Don't intercept the Enter that commits IME composition or the arrow keys picking candidates
    if (event.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      moveHighlight(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      openIfFinished(matches[highlighted])
    }
  }

  // Listened for on the window rather than on the view, which isn't a control, and only for keys
  // pressed inside it: an Escape in a menu opened over it belongs to the menu
  const clearSearchThenClose = (event: KeyboardEvent) => {
    if (event.isComposing || event.key !== "Escape") return
    if (!(event.target instanceof Node) || view?.contains(event.target) !== true) return
    event.preventDefault()
    event.stopPropagation()
    if (query === "") {
      ctx.bodyPanel.close()
      return
    }
    editQuery("")
    searchField?.focus()
  }
</script>

{#snippet summary(download: Download)}
  <DownloadFileIcon {download} />
  <span class="text">
    {#if download.progress._tag === "Canceled"}
      <s class="name">{download.fileName}</s>
    {:else}
      <span class="name">{download.fileName}</span>
    {/if}
    {#if download.progress._tag === "InProgress" || download.progress._tag === "Paused"}
      {@const { receivedBytes, totalBytes } = download.progress}
      {#if totalBytes === null}
        <progress class="bar" aria-label={download.fileName}></progress>
      {:else}
        <progress
          class="bar"
          class:paused={download.progress._tag === "Paused"}
          aria-label={download.fileName}
          max={totalBytes}
          value={receivedBytes}
        ></progress>
      {/if}
    {/if}
    <span class="meta">
      {#each detailsOf(download) as detail, index (index)}
        <span data-tone={detail.tone}>{detail.text}</span>
      {/each}
    </span>
  </span>
{/snippet}

{#snippet backButton()}
  <button
    class="back"
    type="button"
    aria-label={t("sidepanel.downloads.close")}
    title={t("sidepanel.downloads.close")}
    onclick={() => ctx.bodyPanel.close()}
  >
    <Icon name="chevronLeft" />
  </button>
{/snippet}

<svelte:window onkeydown={clearSearchThenClose} />

<section bind:this={view} class="downloads" aria-labelledby="{ids}-heading">
  <header class="header">
    {@render backButton()}
    <h2 id="{ids}-heading" class="heading">{t("sidepanel.downloads.title")}</h2>
  </header>

  <label class="field">
    <Icon name="search" size={14} />
    <input
      bind:this={searchField}
      type="search"
      aria-label={t("sidepanel.downloads.search")}
      aria-controls="{ids}-results"
      placeholder={t("sidepanel.downloads.search")}
      value={query}
      oninput={(event) => editQuery(event.currentTarget.value)}
      onkeydown={onSearchKeyDown}
      {@attach focusOnOpen}
    />
  </label>

  <div class="kinds" role="radiogroup" aria-label={t("sidepanel.downloads.kinds")}>
    {#each kindFilters as filter (filter)}
      <button
        type="button"
        role="radio"
        aria-checked={kind === filter}
        onclick={() => chooseKind(filter)}>{t(kindMessages[filter])}</button
      >
    {/each}
  </div>

  <div id="{ids}-results" class="results">
    {#if downloads !== null && downloads.length === 0}
      <p class="empty">{t("sidepanel.downloads.empty")}</p>
    {:else if downloads !== null && matches.length === 0}
      <p class="empty">{t("sidepanel.downloads.noMatch")}</p>
    {:else}
      <ul class="entries">
        {#each matches as download, index (download.id)}
          {@const actions = actionsOf(download)}
          <li
            id={rowId(index)}
            class="entry"
            class:canceled={download.progress._tag === "Canceled"}
            data-highlighted={index === highlighted}
            style:--action-count={actions.length}
            onpointermove={() => (highlighted = index)}
          >
            {#if download.progress._tag === "Complete"}
              <button
                class="main"
                type="button"
                title={download.fileName}
                onclick={() => ctx.downloads.open(download.id)}
              >
                {@render summary(download)}
              </button>
            {:else}
              <div class="main" title={download.fileName}>{@render summary(download)}</div>
            {/if}
            {#if actions.length > 0}
              <div class="actions">
                {#each actions as action (action.label)}
                  <button
                    class="action"
                    type="button"
                    aria-label={action.label}
                    title={action.label}
                    onclick={action.run}
                  >
                    <Icon name={action.icon} size={14} />
                  </button>
                {/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="footer">
    {@render backButton()}
    <button
      class="show-all"
      type="button"
      onclick={() => void ctx.run({ _tag: "OpenDownloadsPage", windowId: ctx.view.windowId })}
    >
      {t("sidepanel.downloads.showAll")}
    </button>
  </footer>
</section>

<style>
  .downloads {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding-top: 8px;
    animation: downloads-in 160ms ease-out;
  }

  @keyframes downloads-in {
    from {
      opacity: 0;
    }
  }

  .header {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    height: 32px;
  }

  .back {
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
  }

  .back:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .heading {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .field {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px 0 11px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
    color: var(--text-muted);
  }

  .field:focus-within {
    background: var(--surface-raised);
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: none;
    color: var(--text);
    font-size: 13px;
  }

  .field input::placeholder {
    color: var(--text-muted);
  }

  .field input::-webkit-search-cancel-button {
    filter: grayscale(1);
  }

  .kinds {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 4px;
  }

  .kinds button {
    height: 24px;
    padding: 0 9px;
    border: none;
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .kinds button:hover {
    color: var(--text);
  }

  .kinds button[aria-checked="true"] {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text);
  }

  .results {
    flex: 1;
    min-height: 0;
    margin: 0 -8px;
    padding: 0 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--divider) transparent;
  }

  .empty {
    margin: 16px 0;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  .entries {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
  }

  .entry {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--radius-row);
    list-style: none;
  }

  .entry:hover,
  .downloads:has(.field input:focus) .entry[data-highlighted="true"] {
    background: var(--surface-hover);
  }

  .main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 8px 6px 10px;
    overflow: hidden;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  /* The text gives way to the actions laid over the row's right edge, so however long the name,
     they show in full */
  .entry:hover .main,
  .entry:focus-within .main {
    padding-inline-end: calc(var(--action-count) * 26px + 8px);
  }

  .entry.canceled .main {
    opacity: 0.55;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name,
  .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.003em;
  }

  .meta {
    display: flex;
    gap: 8px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .meta [data-tone="State"] {
    font-weight: 600;
  }

  .meta [data-tone="Alert"] {
    color: var(--danger);
    font-weight: 600;
  }

  .bar {
    width: 100%;
    height: 3px;
    margin: 2px 0 1px;
    overflow: hidden;
    border: none;
    border-radius: 2px;
    background: var(--surface-active);
    appearance: none;
  }

  .bar::-webkit-progress-bar {
    background: var(--surface-active);
  }

  .bar::-webkit-progress-value {
    border-radius: 2px;
    background: var(--text);
    transition: width 300ms ease;
  }

  .bar.paused::-webkit-progress-value {
    background: var(--text-muted);
  }

  .actions {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 6px;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action {
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
  }

  .entry:hover .action,
  .entry:focus-within .action {
    opacity: 1;
  }

  .action:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  /* Laid out as the bottom bar the view takes the place of, so its back button sits where the
     Downloads button was */
  .footer {
    display: grid;
    flex: none;
    grid-template-columns: 30px 1fr 30px;
    align-items: center;
    height: 44px;
    padding-bottom: 4px;
  }

  .show-all {
    justify-self: center;
    padding: 4px 10px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .show-all:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
