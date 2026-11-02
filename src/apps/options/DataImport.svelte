<script lang="ts">
  import { Cause, type Effect, Exit, Option } from "effect"
  import type { Translator } from "#modules/i18n"
  import type { Ports } from "#platform/browser"
  import {
    confirmImport,
    type ImportCandidate,
    type ImportSource,
    prepareArcImport,
    prepareKatipImport,
  } from "./data-import"
  import { previewLinesOf, problemMessageOf, type PreparationError } from "./import-preview"
  import type { OptionsRuntime } from "./options-runtime"
  import type { PlainMessageKey } from "./plain-message-key"
  import PushButton from "./PushButton.svelte"
  import SettingRow from "./SettingRow.svelte"
  import SettingsSection from "./SettingsSection.svelte"
  import Switch from "./Switch.svelte"

  let {
    runtime,
    t,
    onfinish,
  }: {
    runtime: OptionsRuntime
    t: Translator["t"]
    /** Called once an import ends, whether it finished. */
    onfinish: (finished: boolean) => void
  } = $props()

  const ARC_FILE_ON_MAC = "~/Library/Application Support/Arc/StorableSidebar.json"
  const ARC_FOLDER_ON_WINDOWS =
    "%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_…\\LocalCache\\Local\\Arc\\"

  type Phase =
    | { readonly _tag: "Idle" }
    | { readonly _tag: "Reading" }
    | { readonly _tag: "Unpreviewable"; readonly problem: PlainMessageKey }
    | { readonly _tag: "Previewing"; readonly candidate: ImportCandidate }
    | { readonly _tag: "Importing"; readonly candidate: ImportCandidate }

  const id = $props.id()
  const locationHeadingId = `${id}-location`
  const previewHeadingId = `${id}-preview`
  const addedHeadingId = `${id}-added`
  const adjustedHeadingId = `${id}-adjusted`
  const leftOutHeadingId = `${id}-left-out`

  let phase = $state<Phase>({ _tag: "Idle" })
  let opensFavorites = $state(true)
  let arcInput = $state<HTMLInputElement>()
  let katipInput = $state<HTMLInputElement>()

  const candidate = $derived(
    phase._tag === "Previewing" || phase._tag === "Importing" ? phase.candidate : null,
  )
  const isBusy = $derived(phase._tag === "Reading" || phase._tag === "Importing")

  const preparationOf = (
    source: ImportSource,
    file: File,
  ): Effect.Effect<ImportCandidate, PreparationError, Ports> =>
    source === "Arc" ? prepareArcImport(file) : prepareKatipImport(file)

  const choose = async (source: ImportSource, input: HTMLInputElement) => {
    const file = input.files?.[0]
    // Cleared so that choosing the same file again, after fixing it or cancelling, is a change
    input.value = ""
    if (file === undefined) return
    phase = { _tag: "Reading" }
    const prepared = await runtime.runPromiseExit(preparationOf(source, file))
    if (Exit.isSuccess(prepared)) {
      opensFavorites = true
      phase = { _tag: "Previewing", candidate: prepared.value }
      return
    }
    phase = {
      _tag: "Unpreviewable",
      problem: Option.match(Cause.findErrorOption(prepared.cause), {
        onNone: (): PlainMessageKey => "options.data.import.problem.unavailable",
        onSome: problemMessageOf,
      }),
    }
  }

  const confirm = async (chosen: ImportCandidate) => {
    phase = { _tag: "Importing", candidate: chosen }
    const imported = await runtime.runPromiseExit(confirmImport(chosen, opensFavorites))
    phase = { _tag: "Idle" }
    onfinish(Exit.isSuccess(imported))
  }

  const cancel = () => {
    phase = { _tag: "Idle" }
  }
</script>

<SettingsSection
  heading={t("options.data.import.heading")}
  footnote={t("options.data.import.footnote")}
>
  <SettingRow
    label={t("options.data.import.arc.label")}
    description={t("options.data.import.arc.description")}
    labelsControl={false}
  >
    {#snippet children(control)}
      <PushButton {...control} disabled={isBusy} onclick={() => arcInput?.click()}>
        {t("options.data.import.choose")}
      </PushButton>
    {/snippet}
  </SettingRow>
  <SettingRow
    label={t("options.data.import.katip.label")}
    description={t("options.data.import.katip.description")}
    labelsControl={false}
  >
    {#snippet children(control)}
      <PushButton {...control} disabled={isBusy} onclick={() => katipInput?.click()}>
        {t("options.data.import.choose")}
      </PushButton>
    {/snippet}
  </SettingRow>
</SettingsSection>

<input
  bind:this={arcInput}
  type="file"
  accept=".json,application/json"
  aria-label={t("options.data.import.arc.file")}
  hidden
  onchange={(event) => choose("Arc", event.currentTarget)}
/>
<input
  bind:this={katipInput}
  type="file"
  accept=".json,application/json"
  aria-label={t("options.data.import.katip.file")}
  hidden
  onchange={(event) => choose("Katip", event.currentTarget)}
/>

{#if phase._tag === "Unpreviewable"}
  <p class="problem" role="alert">{t(phase.problem)}</p>
{/if}

{#if candidate !== null}
  {@const current = candidate}
  {@const lines = previewLinesOf(current, opensFavorites)}
  {@const hasContent = current.summary.spaces > 0 || current.summary.favorites > 0}
  <section class="preview" aria-labelledby={previewHeadingId}>
    <header>
      <h3 id={previewHeadingId}>
        {t(
          current.source === "Arc"
            ? "options.data.import.preview.arcHeading"
            : "options.data.import.preview.katipHeading",
        )}
      </h3>
      <span class="file-name">{current.fileName}</span>
    </header>

    {#if hasContent}
      <h4 id={addedHeadingId}>{t("options.data.import.preview.added")}</h4>
      <ul aria-labelledby={addedHeadingId}>
        {#each lines.added as line (line.key)}
          <li>{t(line.key, { count: line.count })}</li>
        {/each}
      </ul>
      {#if current.summary.favorites > 0}
        <SettingRow
          label={t("options.data.import.openFavorites.label")}
          description={t("options.data.import.openFavorites.description")}
          disabled={phase._tag === "Importing"}
        >
          {#snippet children(control)}
            <Switch
              {...control}
              checked={opensFavorites}
              onchange={(checked) => (opensFavorites = checked)}
            />
          {/snippet}
        </SettingRow>
      {/if}
    {:else}
      <p>{t("options.data.import.preview.nothing")}</p>
    {/if}

    {#if lines.adjusted.length > 0}
      <h4 id={adjustedHeadingId}>{t("options.data.import.preview.adjusted")}</h4>
      <ul aria-labelledby={adjustedHeadingId}>
        {#each lines.adjusted as line (line.key)}
          <li>{t(line.key, { count: line.count })}</li>
        {/each}
      </ul>
    {/if}

    {#if lines.leftOut.length > 0 || current.source === "Katip"}
      <h4 id={leftOutHeadingId}>{t("options.data.import.preview.leftOut")}</h4>
      <ul aria-labelledby={leftOutHeadingId}>
        {#each lines.leftOut as line (line.key)}
          <li>{t(line.key, { count: line.count })}</li>
        {/each}
        {#if current.source === "Katip"}
          <li>{t("options.data.import.preview.settings")}</li>
        {/if}
      </ul>
    {/if}

    <div class="actions">
      <PushButton onclick={cancel} disabled={phase._tag === "Importing"}>
        {t("options.data.import.cancel")}
      </PushButton>
      <PushButton
        onclick={() => confirm(current)}
        disabled={phase._tag === "Importing" || lines.added.length === 0}
      >
        {t("options.data.import.confirm")}
      </PushButton>
    </div>
  </section>
{/if}

<section class="location" aria-labelledby={locationHeadingId}>
  <h3 id={locationHeadingId}>{t("options.data.import.arcLocation.heading")}</h3>
  <dl>
    <div class="place">
      <dt>{t("options.data.import.arcLocation.mac")}</dt>
      <dd>
        <code>{ARC_FILE_ON_MAC}</code>
        <span>{t("options.data.import.arcLocation.macTip")}</span>
      </dd>
    </div>
    <div class="place">
      <dt>{t("options.data.import.arcLocation.windows")}</dt>
      <dd>
        <code>{ARC_FOLDER_ON_WINDOWS}</code>
        <span>{t("options.data.import.arcLocation.windowsTip")}</span>
      </dd>
    </div>
  </dl>
</section>

<style>
  h3 {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.005em;
  }

  .location dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .place {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
  }

  dt {
    color: var(--text-muted);
    font-size: 12.5px;
  }

  dd {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    margin: 0;
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.5;
  }

  code {
    overflow-wrap: anywhere;
    color: var(--text);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    user-select: all;
  }

  .problem {
    margin: 0;
    color: var(--danger);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 12px;
    background: var(--surface-raised);
    box-shadow: 0 0 0 0.5px var(--divider);
  }

  .preview header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
  }

  .preview h3 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
  }

  .file-name {
    overflow-wrap: anywhere;
    color: var(--text-muted);
    font-size: 12px;
  }

  h4 {
    margin: 10px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    font-weight: 400;
    line-height: 1.6;
  }

  .preview p {
    margin: 4px 0 0;
    font-weight: 400;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
