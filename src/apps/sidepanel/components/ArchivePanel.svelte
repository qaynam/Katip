<script lang="ts">
  import { Option, Result } from "effect"
  import type { IdleMinutes } from "#modules/settings"
  import type { SpaceId } from "#modules/space"
  import { idleMinutesFrom } from "../logic/drafts"
  import { describeElapsed } from "../logic/elapsed-time"
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
  const ids = $props.id()

  let scope = $state<ArchiveScope>("currentSpace")
  // 入力中は手元の文字を表示し、新しいビューが届いても書き換えない
  let minutesDraft = $state<string | null>(null)
  let minutesError = $state<string | null>(null)

  const autoArchive = $derived(ctx.view.autoArchive)
  const entries = $derived(archiveEntriesFor(ctx.view.archive, scope, spaceId))
  const spaceById = $derived(new Map(ctx.view.spaces.map((space) => [space.id, space])))

  const updateAutoArchive = (enabled: boolean, idleMinutes: IdleMinutes) =>
    void ctx.run({ _tag: "UpdateAutoArchive", enabled, idleMinutes })

  const discardMinutesDraft = () => {
    minutesDraft = null
    minutesError = null
  }

  const toggle = (enabled: boolean) => {
    discardMinutesDraft()
    updateAutoArchive(enabled, autoArchive.idleMinutes)
  }

  const commitMinutes = () => {
    if (minutesDraft === null) return
    const parsed = idleMinutesFrom(minutesDraft)
    if (Result.isFailure(parsed)) {
      minutesError = parsed.failure
      return
    }
    discardMinutesDraft()
    if (parsed.success !== autoArchive.idleMinutes) {
      updateAutoArchive(autoArchive.enabled, parsed.success)
    }
  }

  const editMinutes = (draft: string) => {
    minutesDraft = draft
    minutesError = null
  }
</script>

<section class="archive" aria-labelledby="{ids}-heading">
  <h2 id="{ids}-heading" class="heading">アーカイブ</h2>

  <div class="settings">
    <label class="toggle">
      <input
        type="checkbox"
        checked={autoArchive.enabled}
        onchange={(event) => toggle(event.currentTarget.checked)}
      />
      <span>使っていないタブを自動でアーカイブ</span>
    </label>
    <label class="minutes" class:disabled={!autoArchive.enabled}>
      <input
        type="text"
        inputmode="numeric"
        aria-label="自動でアーカイブするまでの時間（分）"
        aria-invalid={minutesError !== null}
        aria-describedby={minutesError === null ? undefined : `${ids}-minutes-error`}
        disabled={!autoArchive.enabled}
        value={minutesDraft ?? String(autoArchive.idleMinutes)}
        oninput={(event) => editMinutes(event.currentTarget.value)}
        onchange={commitMinutes}
        onblur={commitMinutes}
      />
      <span>分間使われなかったら</span>
    </label>
    {#if minutesError !== null}
      <p id="{ids}-minutes-error" class="minutes-error" role="alert">{minutesError}</p>
    {/if}
  </div>

  <div class="scope" role="radiogroup" aria-label="表示する範囲">
    <button
      type="button"
      role="radio"
      aria-checked={scope === "currentSpace"}
      onclick={() => (scope = "currentSpace")}>この Space</button
    >
    <button
      type="button"
      role="radio"
      aria-checked={scope === "allSpaces"}
      onclick={() => (scope = "allSpaces")}>すべての Space</button
    >
  </div>

  {#if entries.length === 0}
    <p class="empty">アーカイブしたタブはありません</p>
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
                    ><span class="dot" data-space-color={space.color}></span>{space.name}</span
                  >
                {/if}
                <span>{Option.getOrElse(hostOf(entry.url), () => entry.url)}</span>
                <span>{describeElapsed(entry.archivedAt, now())}</span>
              </span>
            </span>
          </button>
          <button
            class="remove"
            type="button"
            aria-label="アーカイブから削除"
            title="アーカイブから削除"
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
    padding: 2px 6px 12px;
  }

  .heading {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
  .minutes {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .minutes.disabled {
    color: var(--text-muted);
  }

  .minutes input {
    width: 64px;
    height: 24px;
    padding: 0 6px;
    border: none;
    border-radius: 6px;
    background: var(--surface-active);
    color: var(--text-on-surface);
    font: inherit;
  }

  .minutes input:disabled {
    opacity: 0.5;
  }

  .minutes input[aria-invalid="true"] {
    outline: 2px solid var(--danger);
  }

  .minutes-error {
    margin: -2px 0 0;
    color: var(--danger);
    font-size: 11.5px;
    font-weight: 600;
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
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }

  .scope button[aria-checked="true"] {
    background: var(--surface-active);
    box-shadow: var(--shadow-active);
    color: var(--text-on-surface);
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
    background: var(--space-bg-hover);
  }

  .restore {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 6px 4px 6px 10px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
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
    margin-right: 4px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: inherit;
    opacity: 0;
  }

  .entry:hover .remove,
  .remove:focus-visible {
    opacity: 0.7;
  }

  .remove:hover {
    background: color-mix(in srgb, currentColor 12%, transparent);
    opacity: 1;
  }
</style>
