<script lang="ts">
  import { Option } from "effect"
  import { newestFirst, progressDetails, sourceHostOf, type Download } from "../logic/downloads"
  import { getSidebarContext } from "../state/sidebar-context"
  import DownloadFileIcon from "./DownloadFileIcon.svelte"
  import Icon, { type IconName } from "./Icon.svelte"
  import PanelHeader from "./PanelHeader.svelte"

  const SHOWN_COUNT = 30

  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()

  let downloads = $state.raw<ReadonlyArray<Download> | null>(null)
  $effect(() =>
    ctx.downloads.watchRecent(SHOWN_COUNT, (recent) => (downloads = newestFirst(recent))),
  )

  const showLabel = $derived(
    t(
      ctx.downloads.fileManager === "Finder"
        ? "sidepanel.downloads.showInFinder"
        : "sidepanel.downloads.showInFolder",
    ),
  )

  const detailsOf = (download: Download) => [
    ...Option.toArray(sourceHostOf(download.url)),
    ...progressDetails(download.progress, ctx.translator),
  ]
</script>

{#snippet summary(download: Download)}
  <DownloadFileIcon {download} />
  <span class="text">
    <span class="name">{download.fileName}</span>
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
        <span>{detail}</span>
      {/each}
    </span>
  </span>
{/snippet}

{#snippet actionButton(label: string, icon: IconName, run: () => void)}
  <button class="action" type="button" aria-label={label} title={label} onclick={run}>
    <Icon name={icon} size={14} />
  </button>
{/snippet}

<section class="downloads" aria-labelledby="{ids}-heading">
  <PanelHeader
    headingId="{ids}-heading"
    title={t("sidepanel.downloads.title")}
    closeLabel={t("sidepanel.downloads.close")}
  />

  {#if downloads !== null && downloads.length === 0}
    <p class="empty">{t("sidepanel.downloads.empty")}</p>
  {:else if downloads !== null}
    <ul class="entries">
      {#each downloads as download (download.id)}
        {@const { progress } = download}
        <li
          class="entry"
          class:gone={progress._tag === "Deleted" ||
            progress._tag === "Canceled" ||
            progress._tag === "Failed"}
        >
          {#if progress._tag === "Complete"}
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
          <div class="actions">
            {#if progress._tag === "Complete"}
              {@render actionButton(showLabel, "folder", () => ctx.downloads.show(download.id))}
            {:else if progress._tag === "InProgress"}
              {@render actionButton(t("sidepanel.downloads.pause"), "pause", () =>
                ctx.downloads.pause(download.id),
              )}
            {/if}
            {#if (progress._tag === "Paused" || progress._tag === "Failed") && progress.canResume}
              {@render actionButton(t("sidepanel.downloads.resume"), "play", () =>
                ctx.downloads.resume(download.id),
              )}
            {/if}
            {#if progress._tag === "InProgress" || progress._tag === "Paused"}
              {@render actionButton(t("sidepanel.downloads.cancel"), "close", () =>
                ctx.downloads.cancel(download.id),
              )}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <button
    class="show-all"
    type="button"
    onclick={() => void ctx.run({ _tag: "OpenDownloadsPage", windowId: ctx.view.windowId })}
  >
    {t("sidepanel.downloads.showAll")}
  </button>
</section>

<style>
  .downloads {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px 0 12px;
    animation: downloads-in 160ms ease-out;
  }

  @keyframes downloads-in {
    from {
      opacity: 0;
    }
  }

  .empty {
    margin: 12px 0;
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
    display: flex;
    align-items: center;
    border-radius: var(--radius-row);
    list-style: none;
  }

  .entry:hover {
    background: var(--surface-hover);
  }

  .main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 4px 6px 10px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
  }

  .entry.gone .name {
    color: var(--text-muted);
  }

  .entry.gone :global(.image) {
    opacity: 0.5;
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

  .meta {
    display: flex;
    gap: 8px;
    color: var(--text-muted);
    font-size: 11px;
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
    display: flex;
    flex: none;
    gap: 2px;
    margin-right: 6px;
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

  .show-all {
    align-self: center;
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
