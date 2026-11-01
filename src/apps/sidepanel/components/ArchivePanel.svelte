<script lang="ts">
  import { Option } from "effect"
  import { idleDurationOf, idleMinutesChoicesWith, type IdleMinutes } from "#modules/settings"
  import type { SpaceId } from "#modules/space"
  import { describeElapsed } from "../logic/elapsed-time"
  import { themeSwatch } from "../logic/space-themes"
  import { archiveEntriesFor, hostOf, type ArchiveScope } from "../logic/view-queries"
  import { getSidebarContext } from "../state/sidebar-context"
  import Favicon from "./Favicon.svelte"
  import Icon from "./Icon.svelte"

  interface Props {
    spaceId: SpaceId
    now?: () => number
  }

  const { spaceId, now = Date.now }: Props = $props()
  const ctx = getSidebarContext()
  const t = $derived(ctx.translator.t)
  const ids = $props.id()

  let scope = $state<ArchiveScope>("currentSpace")

  const autoArchive = $derived(ctx.view.autoArchive)
  const minutesChoices = $derived(idleMinutesChoicesWith(autoArchive.idleMinutes))
  const entries = $derived(archiveEntriesFor(ctx.view.archive, scope, spaceId))
  const spaceById = $derived(new Map(ctx.view.spaces.map((space) => [space.id, space])))

  const updateAutoArchive = (enabled: boolean, idleMinutes: IdleMinutes) =>
    void ctx.run({ _tag: "UpdateAutoArchive", enabled, idleMinutes })

  const toggle = (enabled: boolean) => updateAutoArchive(enabled, autoArchive.idleMinutes)

  const chooseMinutes = (value: string) => {
    const chosen = minutesChoices.find((minutes) => String(minutes) === value)
    if (chosen !== undefined && chosen !== autoArchive.idleMinutes) {
      updateAutoArchive(autoArchive.enabled, chosen)
    }
  }

  const durationText = (minutes: IdleMinutes) => ctx.translator.duration(idleDurationOf(minutes))
</script>

<section class="archive" aria-labelledby="{ids}-heading">
  <h2 id="{ids}-heading" class="heading">{t("sidepanel.archive.title")}</h2>

  <div class="settings">
    <label class="toggle">
      <input
        type="checkbox"
        checked={autoArchive.enabled}
        onchange={(event) => toggle(event.currentTarget.checked)}
      />
      <span>{t("sidepanel.archive.autoArchive")}</span>
    </label>
    <label class="duration" class:disabled={!autoArchive.enabled}>
      <select
        aria-label={t("sidepanel.archive.idleTime")}
        disabled={!autoArchive.enabled}
        onchange={(event) => chooseMinutes(event.currentTarget.value)}
      >
        {#each minutesChoices as minutes (minutes)}
          <option value={String(minutes)} selected={minutes === autoArchive.idleMinutes}>
            {durationText(minutes)}
          </option>
        {/each}
      </select>
      <span>{t("sidepanel.archive.idleTimeSuffix")}</span>
    </label>
  </div>

  <div class="scope" role="radiogroup" aria-label={t("sidepanel.archive.scope")}>
    <button
      type="button"
      role="radio"
      aria-checked={scope === "currentSpace"}
      onclick={() => (scope = "currentSpace")}>{t("sidepanel.archive.thisSpace")}</button
    >
    <button
      type="button"
      role="radio"
      aria-checked={scope === "allSpaces"}
      onclick={() => (scope = "allSpaces")}>{t("sidepanel.archive.allSpaces")}</button
    >
  </div>

  {#if entries.length === 0}
    <p class="empty">{t("sidepanel.archive.empty")}</p>
  {:else}
    <ul class="entries">
      {#each entries as entry (entry.id)}
        {@const space = spaceById.get(entry.spaceId)}
        <li class="entry">
          <button
            class="restore"
            type="button"
            title="{entry.title}&#10;{entry.url}"
            onclick={() =>
              void ctx.run({
                _tag: "RestoreArchiveEntry",
                windowId: ctx.view.windowId,
                entryId: entry.id,
              })}
          >
            <Favicon pageUrl={entry.url} favIconUrl={null} title={entry.title} />
            <span class="text">
              <span class="title">{entry.title || entry.url}</span>
              <span class="meta">
                {#if scope === "allSpaces" && space !== undefined}
                  <span class="space"
                    ><span
                      class="dot"
                      style:background={Option.getOrElse(
                        themeSwatch(space.theme.colors),
                        () => "currentColor",
                      )}
                    ></span>{space.name}</span
                  >
                {/if}
                <span>{Option.getOrElse(hostOf(entry.url), () => entry.url)}</span>
                <span>{describeElapsed(entry.archivedAt, now(), ctx.translator)}</span>
              </span>
            </span>
          </button>
          <button
            class="remove"
            type="button"
            aria-label={t("sidepanel.archive.remove")}
            title={t("sidepanel.archive.remove")}
            onclick={() => void ctx.run({ _tag: "RemoveArchiveEntry", entryId: entry.id })}
          >
            <Icon name="close" size={14} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .archive {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px 0 12px;
    animation: archive-in 160ms ease-out;
  }

  .heading {
    margin: 4px 10px 0;
    font-size: 14px;
    font-weight: 700;
  }

  @keyframes archive-in {
    from {
      opacity: 0;
    }
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface-raised);
    font-size: 12px;
  }

  .toggle,
  .duration {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .duration.disabled {
    color: var(--text-muted);
  }

  .duration select {
    height: 24px;
    padding: 0 4px;
    border: none;
    border-radius: 6px;
    background: var(--surface-active);
    color: inherit;
    font: inherit;
  }

  .duration select:disabled {
    opacity: 0.5;
  }

  .scope {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--surface-raised);
  }

  .scope button {
    flex: 1;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .scope button[aria-checked="true"] {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text);
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

  .restore {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 4px 6px 10px;
    border: none;
    background: none;
    text-align: start;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title,
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

  .space {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--space-swatch);
  }

  .remove {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    margin-right: 6px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-muted);
    opacity: 0;
  }

  .entry:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  .remove:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
</style>
